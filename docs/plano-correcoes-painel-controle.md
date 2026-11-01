# Plano de correções — painel de controle funcional

Auditoria completa (UI React, backend Rust, Android) mapeou o que funciona e o
que é placeholder. Este documento lista as correções em fases, na ordem de
execução. Cada fase é compilada, testada e validada antes da próxima.

## Contexto do problema

O painel de controle do PC (mute/volume) é **100% fake**:

- `App.tsx:121-124`: `muted={false} // TODO`, `volume={1.0}`,
  `onMuteChange={() => {}}`, `onVolumeChange={() => {}}`.
- Não existe comando Tauri de mute/volume.
- `ControlState.muted/volume` (escrito pelo celular via WebSocket) nunca é
  aplicado ao áudio reproduzido no PC — é estado morto.

Decisão de design: o mute/volume do painel é **controle local do PC sobre a
reprodução** (auto-contido no `AudioPipeline`), distinto do mute/volume que o
celular envia via WS.

---

## Fase 1 — Mute/volume do PC funcional (crítico)

### Backend (Rust)

1. **`audio/mod.rs` — `AudioPipeline`**
   - Adicionar campos `mute: Arc<AtomicBool>` e
     `volume: Arc<AtomicU32>` (fixed-point `0..=4000`, onde `1000` = 100%,
     permitindo até 400% de ganho).
   - Criar `AudioControls` (cloneable, `Arc`) com `set_mute`, `set_volume`,
     `muted()`, `volume()`; `set_volume` valida/clampa `0..=4000`.
   - `start()` retorna o pipeline junto com os controles (ou os expõe via
     método `controls()`).
   - `Volume` inicial: `1000` (100%).

2. **`audio/sink.rs` — aplicar no callback RT**
   - Passar os átomos para `start_output` → callback.
   - No callback, após obter amostras do jitter buffer:
     - Se `mute == true` → escrever silêncio.
     - Senão, aplicar ganho: `sample * volume / 1000` com saturação em i16
       (operação por amostra, sem alocação — seguro em tempo real).
   - Testes unitários: mute zera a saída; volume 0 zera; 2000 dobra; 4000
     satura sem estourar.

3. **`server.rs` — `ServerStats`**
   - Adicionar campos `muted: bool` e `volume: u32` ao `ServerStats`.
   - `Server` guarda `AudioControls` e preenche os campos em `stats()`.
   - Expor `Server::set_mute(bool)` / `Server::set_volume(u32)` delegando ao
     pipeline.

4. **`state.rs` — `AppState`**
   - Métodos `set_mute(bool)` / `set_volume(u32)` (escrevem no server atual;
     no-op se servidor parado, mas persistindo valor desejado para o próximo
     start — decidir: aplicar ao reiniciar).

5. **`commands.rs` + `lib.rs` — novos comandos**
   - `set_mute(muted: bool) -> Result<(), CommandError>`
   - `set_volume(volume: u32) -> Result<(), CommandError>` (clampa 0..=4000).
   - Registrar ambos no `invoke_handler`.
   - `get_server_stats` passa a incluir `muted`/`volume` (via `ServerStats`).

### Frontend (React)

6. **`types/index.ts`** — `ServerStats` ganha `muted: boolean` e
   `volume: number`.
7. **`hooks/useServer.ts`**
   - Handlers `setMute(muted)` e `setVolume(volume)`: `invoke` +
     atualização otimista de `stats`.
   - `EMPTY_STATS` atualizado com `muted: false, volume: 1000`.
8. **`App.tsx`** — wirear `<ControlsPanel muted={stats.muted}
   volume={stats.volume / 1000} onMuteChange={setMute}
   onVolumeChange={(v) => setVolume(Math.round(v * 1000))} />` (remover TODO
   e stubs).

### Validação

- `cargo build/test/clippy/fmt`; `npm run build`.
- No `tauri:dev`: ligar mute → áudio do celular some no PC; desligar → volta;
  mexer volume → ganho muda; stats refletem o estado.

---

## Fase 2 — `isDefault` real no seletor de dispositivos

9. **`audio/sink.rs`** — `list_output_devices` retorna
   `Vec<OutputDevice { index, name, is_default }>`; `is_default` comparando
   com `host.default_output_device()`.
10. **`commands.rs`** — comando `list_output_devices` passa a retornar a
    lista estruturada (o campo de config continua sendo o nome).
11. **`hooks/useServer.ts` / `DeviceSelector.tsx`** — usar `isDefault` real
    (hoje forçado a `false`).

---

## Fase 3 — Discovery plugado na UI

12. **`hooks/useServer.ts`** — chamar `loadDiscovery` no boot (junto com
    `get_server_config`) e a cada tick do polling enquanto o servidor roda.
13. **`App.tsx`** — passar `discovery` ao `ServerStatus` (a pílula "Beacon"
    deixa de ficar em branco).

---

## Fase 4 — "Limpar logs" e "Reconexões" reais

14. **`hooks/useServer.ts`** — expor `clearLogs()` (setState `[]`);
    **`LogConsole.tsx:61`** — botão chama o handler real.
15. **Backend** — contar reconexões no `ControlServer` (incrementar ao
    receber novo `hello` de sessão existente) e incluir
    `reconnects: u32` no `ServerStats`.
16. **`StatsPanel.tsx:111-116`** — exibir `reconexões` real em vez do
    placeholder de `gaps`.

---

## Fase 5 — `spawn_stats_emitter` idempotente

17. **`commands.rs`/`lib.rs`** — hoje `spawn_stats_emitter` é chamada no
    `setup` **e** no `start_server` → duas tasks a 1 Hz após restart.
    - Solução: mover o spawn para dentro do ciclo de vida do `Server`
      (cancelar no stop via `JoinHandle` no `Server.tasks`), mantendo uma
      única task emissora por instância do servidor.

---

## Fora do escopo imediato (conhecido, anotado)

- Android: mute não silencia o envio (só sinaliza flag) — decisão de produto
  pendente.
- Android: mute/volume não ressincronizam ao reconectar (o `welcome` do PC
  não carrega estado de mute/volume).
- Release: rebuild do `micshare-pc.exe` + APK e reanexo à release após as
  fases (nova tag `v0.2.1`).
