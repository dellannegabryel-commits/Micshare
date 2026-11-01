//! Erro estruturado do backend, exposto à UI com **código** + mensagem.
//!
//! A UI precisa exibir um código estável (para i18n/Logs) e uma mensagem
//! legível para o usuário. `code` segue convenção `SCENE_CAUSA` em
//! `lowerCamelCase` para ser consumido diretamente pelo frontend.

use serde::Serialize;

/// Erro de comando, serializado para a UI como `{ code, message }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    /// Código estável do erro (ex.: `portInUse`, `audioDeviceNotFound`).
    pub code: String,
    /// Mensagem legível para o usuário.
    pub message: String,
}

impl CommandError {
    /// Cria um erro com código e mensagem.
    #[must_use]
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
        }
    }

    /// Porta já em uso (bind falhou com `AddrInUse`).
    #[must_use]
    pub fn port_in_use(port: u16) -> Self {
        Self::new(
            "portInUse",
            format!("a porta {port} já está em uso por outro processo"),
        )
    }

    /// Permissão negada ao abrir/bidar socket.
    #[must_use]
    pub fn permission_denied(detail: impl std::fmt::Display) -> Self {
        Self::new("permissionDenied", format!("permissão negada: {detail}"))
    }

    /// Dispositivo de áudio de saída não encontrado.
    #[must_use]
    pub fn audio_device(detail: impl std::fmt::Display) -> Self {
        Self::new("audioDeviceError", format!("{detail}"))
    }

    /// Erro genérico de I/O ao iniciar subsistema.
    #[must_use]
    pub fn io(subsystem: &str, detail: impl std::fmt::Display) -> Self {
        Self::new(
            "ioError",
            format!("falha no subsistema {subsystem}: {detail}"),
        )
    }

    /// Erro interno inesperado.
    #[must_use]
    pub fn internal(detail: impl std::fmt::Display) -> Self {
        Self::new("internal", format!("{detail}"))
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for CommandError {}

/// Classifica um `std::io::Error` de bind em um `CommandError` com código.
#[must_use]
pub fn from_bind_error(subsystem: &str, port: u16, err: &std::io::Error) -> CommandError {
    use std::io::ErrorKind;
    match err.kind() {
        ErrorKind::AddrInUse => CommandError::port_in_use(port),
        ErrorKind::PermissionDenied => CommandError::permission_denied(err),
        _ => CommandError::io(subsystem, err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializa_como_camel_case() {
        let err = CommandError::port_in_use(41236);
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("\"code\":\"portInUse\""));
        assert!(json.contains("\"message\":"));
    }

    #[test]
    fn addr_in_use_vira_port_in_use() {
        let io = std::io::Error::from(std::io::ErrorKind::AddrInUse);
        let err = from_bind_error("controle", 41236, &io);
        assert_eq!(err.code, "portInUse");
        assert!(err.message.contains("41236"));
    }
}
