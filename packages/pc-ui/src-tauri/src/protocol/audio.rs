//! Header binário do frame de áudio — `docs/arquitetura.md` §3.2.
//!
//! 16 bytes, Big-Endian:
//!
//! | offset | size | campo            | notas                          |
//! |--------|------|------------------|--------------------------------|
//! | 0      | 2    | `magic` `0x4D53` | descarta pacote de outra app   |
//! | 2      | 1    | `version` `1`    |                                |
//! | 3      | 1    | `flags`          | bit0 = SILENCE, bit1 = MUTED   |
//! | 4      | 4    | `seq` u32        | +1 por frame                   |
//! | 8      | 4    | `capture_ts` u32 | ms do relógio do celular       |
//! | 12     | 2    | `payload_len` u16| valida contra o datagrama       |
//! | 14     | 1    | `channels` `1`   |                                |
//! | 15     | 1    | `codec`          | 0 = PCM s16le, 1 = Opus        |

use byteorder::{BigEndian, ByteOrder};
use serde::{Deserialize, Serialize};

/// Tamanho fixo do header em bytes.
pub const HEADER_LEN: usize = 16;

/// Magic do protocolo ("MS").
pub const MAGIC: u16 = 0x4D53;

/// Versão atual do header.
pub const VERSION: u8 = 1;

/// Payload máximo aceito (evita estouro de MTU).
pub const MAX_PAYLOAD_LEN: u16 = 1472;

/// Flag: frame de silêncio (PLC).
pub const FLAG_SILENCE: u8 = 0b0000_0001;

/// Flag: celular mutado.
pub const FLAG_MUTED: u8 = 0b0000_0010;

/// Codec do payload.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioCodec {
    /// PCM 16-bit little-endian (MVP).
    Pcm16 = 0,
    /// Opus (Fase 2).
    Opus = 1,
}

/// Header de um frame de áudio.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioFrameHeader {
    /// Flags (SILENCE/MUTED).
    pub flags: u8,
    /// Número de sequência, monotônico por sessão.
    pub seq: u32,
    /// Timestamp de captura em ms.
    pub capture_ts: u32,
    /// Tamanho do payload em bytes.
    pub payload_len: u16,
    /// Número de canais.
    pub channels: u8,
    /// Codec do payload.
    pub codec: AudioCodec,
}

/// Erro de validação de um frame recebido.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameError {
    /// O datagrama é menor que o header.
    TooShort,
    /// `magic` diferente de `0x4D53`.
    BadMagic,
    /// Versão não suportada.
    BadVersion,
    /// `payload_len` fora da faixa válida.
    BadPayloadLen,
    /// O tamanho real não bate com `payload_len`.
    LengthMismatch,
}

impl std::fmt::Display for FrameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooShort => write!(f, "datagrama menor que o header"),
            Self::BadMagic => write!(f, "magic inválido"),
            Self::BadVersion => write!(f, "versão não suportada"),
            Self::BadPayloadLen => write!(f, "payload_len fora da faixa"),
            Self::LengthMismatch => write!(f, "tamanho real difere de payload_len"),
        }
    }
}

impl std::error::Error for FrameError {}

impl AudioFrameHeader {
    /// Cria um header para um payload PCM do tamanho informado.
    #[must_use]
    pub fn new(seq: u32, capture_ts: u32, payload_len: u16, codec: AudioCodec) -> Self {
        Self {
            flags: 0,
            seq,
            capture_ts,
            payload_len,
            channels: 1,
            codec,
        }
    }

    /// `true` se o frame marca silêncio.
    #[must_use]
    pub fn is_silence(&self) -> bool {
        self.flags & FLAG_SILENCE != 0
    }

    /// `true` se o frame está mutado.
    #[must_use]
    pub fn is_muted(&self) -> bool {
        self.flags & FLAG_MUTED != 0
    }

    /// Serializa o header em 16 bytes Big-Endian.
    #[must_use]
    pub fn encode(&self) -> [u8; HEADER_LEN] {
        let mut buf = [0_u8; HEADER_LEN];
        // byteorder 1.5 escreve no final do slice: fatiar o campo exato.
        BigEndian::write_u16(&mut buf[0..2], MAGIC);
        buf[2] = VERSION;
        buf[3] = self.flags;
        BigEndian::write_u32(&mut buf[4..8], self.seq);
        BigEndian::write_u32(&mut buf[8..12], self.capture_ts);
        BigEndian::write_u16(&mut buf[12..14], self.payload_len);
        buf[14] = self.channels;
        buf[15] = self.codec as u8;
        buf
    }

    /// Valida e decodifica um datagrama de áudio.
    ///
    /// Aplica a regra do §3.2: magic, versão e `payload_len` precisam bater
    /// com o tamanho real do datagrama.
    pub fn decode(datagram: &[u8]) -> Result<(Self, &[u8]), FrameError> {
        if datagram.len() < HEADER_LEN {
            return Err(FrameError::TooShort);
        }

        let magic = BigEndian::read_u16(&datagram[0..2]);
        if magic != MAGIC {
            return Err(FrameError::BadMagic);
        }

        let version = datagram[2];
        if version != VERSION {
            return Err(FrameError::BadVersion);
        }

        let payload_len = BigEndian::read_u16(&datagram[12..14]);
        if payload_len == 0 || payload_len > MAX_PAYLOAD_LEN {
            return Err(FrameError::BadPayloadLen);
        }

        if datagram.len() != HEADER_LEN + usize::from(payload_len) {
            return Err(FrameError::LengthMismatch);
        }

        let codec = match datagram[15] {
            0 => AudioCodec::Pcm16,
            1 => AudioCodec::Opus,
            _ => AudioCodec::Pcm16,
        };

        Ok((
            Self {
                flags: datagram[3],
                seq: BigEndian::read_u32(&datagram[4..8]),
                capture_ts: BigEndian::read_u32(&datagram[8..12]),
                payload_len,
                channels: datagram[14],
                codec,
            },
            &datagram[HEADER_LEN..],
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_ocupa_16_bytes() {
        let header = AudioFrameHeader::new(7, 1234, 960, AudioCodec::Pcm16);
        assert_eq!(header.encode().len(), HEADER_LEN);
    }

    #[test]
    fn roundtrip_preserva_campos() {
        let header = AudioFrameHeader::new(42, 1_700_000_000, 960, AudioCodec::Pcm16);
        let mut datagram = header.encode().to_vec();
        datagram.extend_from_slice(&[0_u8; 960]);

        let (decoded, payload) = AudioFrameHeader::decode(&datagram).unwrap();
        assert_eq!(decoded, header);
        assert_eq!(payload.len(), 960);
    }

    #[test]
    fn magic_errado_e_rejeitado() {
        let mut datagram = AudioFrameHeader::new(1, 0, 2, AudioCodec::Pcm16)
            .encode()
            .to_vec();
        datagram.extend_from_slice(&[0, 0]);
        // Corrompe o magic ("MS" -> "XX").
        datagram[0] = b'X';
        datagram[1] = b'X';

        assert_eq!(
            AudioFrameHeader::decode(&datagram),
            Err(FrameError::BadMagic)
        );
    }

    #[test]
    fn datagrama_curto_e_rejeitado() {
        assert_eq!(
            AudioFrameHeader::decode(&[0_u8; 8]),
            Err(FrameError::TooShort)
        );
    }

    #[test]
    fn tamanho_divergente_e_rejeitado() {
        let mut datagram = AudioFrameHeader::new(1, 0, 960, AudioCodec::Pcm16)
            .encode()
            .to_vec();
        datagram.extend_from_slice(&[0_u8; 100]);
        assert_eq!(
            AudioFrameHeader::decode(&datagram),
            Err(FrameError::LengthMismatch)
        );
    }

    #[test]
    fn payload_len_fora_da_faixa_e_rejeitado() {
        let mut datagram = AudioFrameHeader::new(1, 0, 5000, AudioCodec::Pcm16)
            .encode()
            .to_vec();
        datagram.extend_from_slice(&[0_u8; 5000]);
        assert_eq!(
            AudioFrameHeader::decode(&datagram),
            Err(FrameError::BadPayloadLen)
        );
    }

    #[test]
    fn flags_de_silencio_e_mute_sao_decodificadas() {
        let mut header = AudioFrameHeader::new(1, 0, 2, AudioCodec::Pcm16);
        header.flags = FLAG_SILENCE | FLAG_MUTED;
        let mut datagram = header.encode().to_vec();
        datagram.extend_from_slice(&[0, 0]);

        let (decoded, _) = AudioFrameHeader::decode(&datagram).unwrap();
        assert!(decoded.is_silence());
        assert!(decoded.is_muted());
    }
}
