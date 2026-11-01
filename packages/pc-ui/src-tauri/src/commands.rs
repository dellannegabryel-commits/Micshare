//! Comandos Tauri expostos à UI (React).
//!
//! Todos os comandos que podem falhar retornam `Result<T, CommandError>`,
//! serializado para a UI como `{ code, message }` — ver `crate::error`.

use tauri::{AppHandle, Emitter, State};

use crate::audio::sink::output_devices;
use crate::config::ServerConfig;
use crate::control::SessionInfo;
use crate::discovery::beacon::BeaconStatus;
use crate::error::CommandError;
use crate::server::ServerStats;
use crate::state::AppState;

/// Evento emitido quando o estado do servidor muda (rodando/parado/erro).
pub const EVENT_STATUS: &str = "server-status";
/// Evento emitido a 1 Hz com as métricas do servidor.
pub const EVENT_STATS: &str = "server-stats";

/// Payload do evento `server-status`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEvent {
    /// `true` se o servidor está rodando.
    pub running: bool,
    /// Último erro, se a inicialização falhou.
    pub error: Option<CommandError>,
}

/// Retorna a configuração atual do servidor.
#[tauri::command]
pub async fn get_server_config(state: State<'_, AppState>) -> Result<ServerConfig, CommandError> {
    Ok(state.config().await)
}

/// Salva a configuração do servidor.
#[tauri::command]
pub async fn save_server_config(
    state: State<'_, AppState>,
    config: ServerConfig,
) -> Result<(), CommandError> {
    state.set_config(config).await;
    Ok(())
}

/// Inicia o servidor (descoberta + controle + áudio) e emite `server-status`.
///
/// Aceita uma configuração opcional para aplicar antes de iniciar. Em caso de
/// falha, emite `server-status` com o erro estruturado e o propaga.
#[tauri::command]
pub async fn start_server(
    app: AppHandle,
    state: State<'_, AppState>,
    config: Option<ServerConfig>,
) -> Result<(), CommandError> {
    let result = state.start_server(config).await;

    match &result {
        Ok(()) => {
            spawn_stats_emitter(app.clone());
            let _ = app.emit(
                EVENT_STATUS,
                StatusEvent {
                    running: true,
                    error: None,
                },
            );
        }
        Err(err) => {
            state.set_last_error(err.clone()).await;
            let _ = app.emit(
                EVENT_STATUS,
                StatusEvent {
                    running: false,
                    error: Some(err.clone()),
                },
            );
        }
    }

    result
}

/// Encerra o servidor e emite `server-status`.
#[tauri::command]
pub async fn stop_server(app: AppHandle, state: State<'_, AppState>) -> Result<(), CommandError> {
    state.stop_server().await;
    let _ = app.emit(
        EVENT_STATUS,
        StatusEvent {
            running: false,
            error: None,
        },
    );
    Ok(())
}

/// Estatísticas agregadas do servidor (polling de fallback da UI).
#[tauri::command]
pub async fn get_server_stats(state: State<'_, AppState>) -> Result<ServerStats, CommandError> {
    Ok(state.stats().await)
}

/// Sessões de controle ativas.
#[tauri::command]
pub async fn get_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, CommandError> {
    Ok(state.sessions().await)
}

/// Retorna o status atual (rodando + último erro) — usado pela UI no boot.
#[tauri::command]
pub async fn get_server_status(state: State<'_, AppState>) -> Result<StatusEvent, CommandError> {
    Ok(StatusEvent {
        running: state.is_running().await,
        error: state.last_error().await,
    })
}

/// Estado do beacon de descoberta.
#[tauri::command]
pub async fn get_discovery_status(
    state: State<'_, AppState>,
) -> Result<Option<BeaconStatus>, CommandError> {
    Ok(state.discovery_status().await)
}

/// Habilita ou desabilita o anúncio do beacon.
#[tauri::command]
pub async fn set_discovery_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), CommandError> {
    state.set_discovery_enabled(enabled).await;
    Ok(())
}

/// Liga ou desliga o mute da reprodução no PC.
#[tauri::command]
pub async fn set_mute(state: State<'_, AppState>, muted: bool) -> Result<(), CommandError> {
    state.set_mute(muted).await;
    Ok(())
}

/// Define o volume da reprodução no PC (fixed-point: 1000 = 100%).
///
/// Valores acima de [`crate::audio::VOLUME_MAX`] são limitados no backend.
#[tauri::command]
pub async fn set_volume(state: State<'_, AppState>, volume: u32) -> Result<(), CommandError> {
    state.set_volume(volume).await;
    Ok(())
}

/// Troca o dispositivo de saída de áudio **em quente** (hot-swap).
///
/// Recebe o nome (ou subnome) do dispositivo — o mesmo formato retornado por
/// [`list_output_devices`]. O novo stream passa a consumir do mesmo jitter
/// buffer; se a abertura falhar, o dispositivo atual **continua ativo** e o
/// erro estruturado é retornado. Retorna o nome efetivamente aberto.
#[tauri::command]
pub async fn set_active_sink(
    state: State<'_, AppState>,
    device_name: Option<String>,
) -> Result<String, CommandError> {
    state.set_output_device(device_name).await
}

/// Lista dispositivos de saída de áudio disponíveis (com `isDefault` real).
#[tauri::command]
pub async fn list_output_devices() -> Result<Vec<crate::audio::OutputDevice>, CommandError> {
    output_devices().map_err(CommandError::audio_device)
}

/// Inicia o beacon de descoberta (se não estiver rodando).
#[tauri::command]
pub async fn start_discovery(state: State<'_, AppState>) -> Result<BeaconStatus, CommandError> {
    let status = state
        .discovery_status()
        .await
        .ok_or_else(|| CommandError::new("serverNotRunning", "servidor não está rodando"))?;

    if status.enabled {
        return Ok(status);
    }

    state.set_discovery_enabled(true).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    state
        .discovery_status()
        .await
        .ok_or_else(|| CommandError::internal("falha ao obter status após iniciar descoberta"))
}

/// Para o beacon de descoberta.
#[tauri::command]
pub async fn stop_discovery(state: State<'_, AppState>) -> Result<(), CommandError> {
    state.set_discovery_enabled(false).await;
    Ok(())
}

/// Abre a página de download do VB-Cable no navegador padrão.
#[tauri::command]
pub async fn install_vbcable() -> Result<(), CommandError> {
    const URL: &str = "https://vb-audio.com/Cable/";
    open::that(URL).map_err(|e| CommandError::internal(format!("falha ao abrir {URL}: {e}")))
}

/// Abre a pasta de logs do sistema no explorador de arquivos.
#[tauri::command]
pub async fn open_log_folder(app: AppHandle) -> Result<(), CommandError> {
    use tauri::Manager;
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| CommandError::internal(format!("falha ao obter pasta de logs: {e}")))?;

    std::fs::create_dir_all(&log_dir)
        .map_err(|e| CommandError::internal(format!("falha ao criar pasta de logs: {e}")))?;

    open::that(&log_dir).map_err(|e| CommandError::internal(format!("falha ao abrir pasta: {e}")))
}

/// Spawna uma task que emite `server-stats` a 1 Hz enquanto o servidor rodar.
///
/// Idempotente: a task é registrada no [`AppState`] e a anterior é abortada,
/// então chamadas repetidas (auto-start + restart pela UI) nunca duplicam o
/// emitter. A task usa `app.state::<AppState>()` a cada tick para obter uma
/// referência fresca ao estado.
pub fn spawn_stats_emitter(app: AppHandle) {
    use tauri::Manager;

    let handle = tauri::async_runtime::spawn({
        let app = app.clone();
        async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_secs(1));
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                ticker.tick().await;

                let state = app.state::<AppState>();

                // Sai do loop quando o servidor para de rodar.
                if !state.is_running().await {
                    break;
                }

                let stats = state.stats().await;
                if app.emit(EVENT_STATS, &stats).is_err() {
                    break; // Janela fechada.
                }
            }
        }
    });

    // Um único emitter por app: aborta a task anterior antes de instalar a nova.
    tauri::async_runtime::spawn(async move {
        app.state::<AppState>().install_stats_emitter(handle).await;
    });
}
