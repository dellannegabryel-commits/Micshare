//! Emissor do beacon UDP de descoberta.
//!
//! O PC anuncia sua presença a 1 Hz em broadcast (global + sub-redes), e
//! responde a probes unicast do celular — usado como fallback quando o
//! broadcast é filtrado pela rede (`docs/arquitetura.md` §6).

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use tokio::net::UdpSocket;
use tokio::sync::watch;

use crate::discovery::targets::broadcast_targets;
use crate::protocol::{Beacon, DiscoveryRequest, AUDIO_PORT, CONTROL_PORT, DISCOVERY_PORT};

/// Intervalo entre beacons (1 Hz).
pub const BEACON_INTERVAL: Duration = Duration::from_secs(1);

/// Identidade anunciada pelo PC.
#[derive(Debug, Clone)]
pub struct BeaconConfig {
    /// Nome do PC anunciado.
    pub name: String,
    /// Porta UDP de áudio.
    pub audio_port: u16,
    /// Porta WebSocket de controle.
    pub ctrl_port: u16,
    /// Código de pareamento; vazio = sem pareamento.
    pub pairing_code: String,
}

impl Default for BeaconConfig {
    fn default() -> Self {
        Self {
            name: hostname::get()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            audio_port: AUDIO_PORT,
            ctrl_port: CONTROL_PORT,
            pairing_code: String::new(),
        }
    }
}

/// Estado observável do emissor.
#[derive(Debug, Clone, Copy, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BeaconStatus {
    /// Beacons enviados desde o início.
    pub sent: u64,
    /// Probes respondidos desde o início.
    pub probes_answered: u64,
    /// Se o anúncio está ativo.
    pub enabled: bool,
}

/// Emissor de beacon: mantém o socket, o loop de announce e o estado.
pub struct BeaconSender {
    socket: UdpSocket,
    targets: Vec<SocketAddr>,
    config: watch::Sender<BeaconConfig>,
    enabled: watch::Sender<bool>,
    status: watch::Sender<BeaconStatus>,
}

impl BeaconSender {
    /// Faz bind no socket UDP de descoberta e prepara os destinos de broadcast.
    pub async fn bind(config: BeaconConfig) -> std::io::Result<Self> {
        Self::bind_on(
            config,
            (IpAddr::V4(Ipv4Addr::UNSPECIFIED), DISCOVERY_PORT),
            broadcast_targets(DISCOVERY_PORT),
        )
        .await
    }

    /// Faz bind em um endereço e destinos explícitos (usado nos testes).
    pub async fn bind_on(
        config: BeaconConfig,
        bind: (IpAddr, u16),
        targets: Vec<SocketAddr>,
    ) -> std::io::Result<Self> {
        let socket = UdpSocket::bind(bind).await?;
        socket.set_broadcast(true)?;

        let (config, _) = watch::channel(config);
        let (enabled, _) = watch::channel(true);
        let (status, _) = watch::channel(BeaconStatus::default());

        Ok(Self {
            socket,
            targets,
            config,
            enabled,
            status,
        })
    }

    /// Endereços para onde o beacon é enviado.
    #[must_use]
    pub fn targets(&self) -> &[SocketAddr] {
        &self.targets
    }

    /// Atualiza a identidade anunciada (aplicada no próximo announce).
    pub fn update(&self, config: BeaconConfig) {
        self.config.send_replace(config);
    }

    /// Habilita ou desabilita o anúncio (probes continuam sendo respondidos).
    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.send_replace(enabled);
        let mut status = *self.status.borrow();
        status.enabled = enabled;
        self.status.send_replace(status);
    }

    /// Snapshot do estado atual.
    pub fn status(&self) -> BeaconStatus {
        *self.status.borrow()
    }

    /// Payload JSON atual do beacon.
    pub fn payload(&self) -> Vec<u8> {
        let config = self.config.borrow();
        let pairing = (!config.pairing_code.is_empty()).then(|| config.pairing_code.clone());
        let beacon = Beacon::new(
            config.name.clone(),
            config.audio_port,
            config.ctrl_port,
            pairing,
        );
        serde_json::to_vec(&beacon).expect("serialização do beacon é infallível")
    }

    /// Envia um beacon para todos os destinos de broadcast.
    ///
    /// Respeita a flag `enabled`: com o beacon desabilitado nada é enviado.
    /// Uma falha em um destino não derruba os demais — erros são logados e o
    /// beacon segue sendo enviado para o resto.
    pub async fn announce_once(&self) -> std::io::Result<bool> {
        if !*self.enabled.borrow() {
            return Ok(false);
        }

        let payload = self.payload();
        for target in &self.targets {
            if let Err(err) = self.socket.send_to(&payload, target).await {
                eprintln!("[discovery] falha ao enviar beacon para {target}: {err}");
            }
        }
        Ok(true)
    }

    /// Endereço local do socket (usado nos testes).
    pub fn local_addr(&self) -> std::io::Result<SocketAddr> {
        self.socket.local_addr()
    }

    /// Responde a um probe unicast com o beacon atual.
    async fn answer_probe(&self, from: SocketAddr) -> std::io::Result<()> {
        let payload = self.payload();
        self.socket.send_to(&payload, from).await?;
        Ok(())
    }

    /// Loop principal: anuncia a 1 Hz e responde a probes.
    pub async fn run(&self) -> std::io::Result<()> {
        let mut ticker = tokio::time::interval(BEACON_INTERVAL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        let mut probe_buf = [0_u8; 256];

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    if self.announce_once().await? {
                        let mut status = *self.status.borrow();
                        status.sent += 1;
                        status.enabled = true;
                        self.status.send_replace(status);
                    }
                }
                received = self.socket.recv_from(&mut probe_buf) => {
                    let (len, from) = received?;
                    let Ok(request) = serde_json::from_slice::<DiscoveryRequest>(&probe_buf[..len])
                    else {
                        continue;
                    };
                    if request == DiscoveryRequest::Probe {
                        self.answer_probe(from).await?;
                        let mut status = *self.status.borrow();
                        status.probes_answered += 1;
                        self.status.send_replace(status);
                    }
                }
            }
        }
    }
}
