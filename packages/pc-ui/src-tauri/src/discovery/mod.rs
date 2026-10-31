//! Descoberta na rede local via beacon UDP (JSON com serde).
//!
//! O PC **anuncia** sua presença (UDP broadcast, 1 Hz) em `41234`; o app
//! celular **escuta** essa porta e monta a lista de PCs. O beacon também
//! responde a probes unicast, cobrindo redes que filtram broadcast.
//!
//! Contrato do beacon: `docs/arquitetura.md` §6.

pub mod beacon;
pub mod targets;

use std::sync::Arc;

use tokio::task::JoinHandle;

pub use beacon::{BeaconConfig, BeaconSender, BeaconStatus};

type DynError = Box<dyn std::error::Error + Send + Sync>;

/// Handle do emissor de beacon, controlado pela UI.
pub struct Discovery {
    sender: Arc<BeaconSender>,
    task: JoinHandle<()>,
}

impl Discovery {
    /// Inicia o emissor: bind no socket e loop de announce em background.
    pub async fn start(config: BeaconConfig) -> Result<Self, DynError> {
        let sender = Arc::new(BeaconSender::bind(config).await?);
        let runner = Arc::clone(&sender);
        let task = tokio::spawn(async move {
            if let Err(err) = runner.run().await {
                eprintln!("[discovery] beacon encerrado com erro: {err}");
            }
        });

        Ok(Self { sender, task })
    }

    /// Snapshot do estado do beacon.
    #[must_use]
    pub fn status(&self) -> BeaconStatus {
        self.sender.status()
    }

    /// Habilita ou desabilita o anúncio.
    pub fn set_enabled(&self, enabled: bool) {
        self.sender.set_enabled(enabled);
    }

    /// Atualiza a identidade anunciada.
    pub fn update(&self, config: BeaconConfig) {
        self.sender.update(config);
    }

    /// Encerra o loop de announce.
    pub fn stop(&self) {
        self.task.abort();
    }
}