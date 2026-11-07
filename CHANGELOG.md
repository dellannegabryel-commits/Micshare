# Release Notes

## [0.5.0]

### Added

- AEC/NS no celular com seletor de microfone (efeitos do app só na fonte `MIC`; `VOICE_COMMUNICATION` fica com o HAL, `UNPROCESSED` continua raw)
- Leitura de `AudioRecord` sem zero-fill: leitura parcial vira carry e o buffer é dimensionado pelo `getMinBufferSize` do dispositivo
- Mute/volume do celular aplicados no PC de verdade (`RemoteGain` no ingest) e `welcome` carregando `muted`/`volume` para o celular ressincronizar o slider
- Latência de rede instrumentada: `ping`/`pong` do celular publicam o offset de relógio e o PC mede `capture → chegada`, com mediana e p95 em `stats` (`latencyMs`, `latencyP95Ms`)
- Medição acústica com bipe de teste no app e `scripts/onset-diff.py` para comparar o onset das duas trilhas
- Simulador de rede ruim `pc/src-tauri/examples/lossy_client.rs` (`--drop-pct`, `--jitter-ms`, `--count`) para validar PLC/fade
- CI em push e pull_request (`.github/workflows/ci.yml`: rust, node e android)

### Changed

- Jitter buffer com alvo adaptativo pelo p95 dos deltas de `capture_ts` (janela de 100 frames, 2–8 frames; outliers acima de 4× o frame descartados)
- Áudio UDP restrito ao IP com sessão de controle ativa (allowlist de IP) no lugar do pareamento por código de 6 dígitos
- `capture_ts` do celular passou a ser monotônico (`SystemClock.elapsedRealtime`)
- Documentação e CHANGELOG sincronizados com o código (v0.5.0)

### Fixed

- PLC limitado com fade (máx. 3 frames, rampa de 64 amostras) — elimina os cliques audíveis de pacote perdido
- Sequência u32 sem overflow: o wrap de `seq` é desenrolado no PC e a sessão que recomeça a contagem não deixa o áudio mudo
- Relógio de captura sem salto: `capture_ts` monotônico e deltas acima de 4× o frame descartados como outlier

### Removed

- Pacote TypeScript `protocol/` — o protocolo vive só no Rust (`pc/src-tauri/src/protocol`)
