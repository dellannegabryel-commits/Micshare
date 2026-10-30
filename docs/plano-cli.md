# Plano — CLI de controle do Micshare PC

**Objetivo:** transformar `micshare-pc` de um "sobe e fica quieto" em uma CLI operável: consultar status, ver clientes conectados, mutar/ajustar volume, desconectar o celular, reiniciar o servidor, trocar dispositivo de saída — tudo sem derrubar o processo e com saída legível ou `--json` para script.

Escopo: apenas `packages/pc` (servidor Node legado, o único que roda hoje nesta máquina). O `pc-ui` (Tauri) fica fora — quando ele assumir, esta CLI vira referência de contrato.

---

## 1. O que existe hoje (levantamento no código)

| Arquivo | O que já faz | Problema para a CLI |
|---|---|---|
| `src/index.ts` | parse manual de `--port/--device/--name/--verbose/--list-devices/--install-vbcable` | sem subcomandos, sem REPL, sem como falar com um servidor já rodando |
| `src/audioServer.ts` | orquestra UDP + jitter + sink + controle + beacon | estado é todo privado; `stop()` não reseta nada; não há `restart` |
| `src/control.ts` | WS, `hello/welcome/mute/volume/bye/stats` | `audioPort: 41235` e porta fixos no corpo; `onMute`/`onVolume` só imprimem; `broadcastStats` nunca é chamado (código morto); sessão pode ser decrementada 2× (`bye` + `close`) |
| `src/sink.ts` | PortAudio via `naudiodon2`, escolhe device por substring | sem ganho, sem mute, sem troca de device em runtime |
| `src/metrics.ts` | snapshot acumulado desde o boot | `fps` é média desde o início — inútil para "como está agora" |
| `src/discovery.ts` | beacon UDP 1 Hz | sem liga/desliga em runtime, sem status exposto |
| `src/audioServer.ts:12` | `checkVBCableAvailable()` usa `require()` | **quebra em ESM** (`type: module`): `require is not defined` |

### Bugs/limitações que o plano precisa corrigir de passagem

1. `checkVBCableAvailable()` com `require` em módulo ESM → trocar por `import` dinâmico já resolvido no `start()`.
2. `sessionCount` em `AudioServer` **e** `sessions` em `ControlServer`: duas fontes de verdade, contagem pode ficar negativa ou duplicada.
3. `hello.token` (código de 6 dígitos) é **ignorado** — `authenticated = true` sempre. O beacon anuncia `pair: false, code: ''`.
4. `broadcastStats()` existe e nunca é chamado → o celular não recebe estatísticas.
5. `onMute`/`onVolume` só logam; não afetam o áudio.
6. `welcome.audioPort` hardcoded `41235` (ignora `--port`).
7. `--port` não muda controle (41236) nem beacon (41234).
8. `maybeLogStats()` é no-op; `lastStatsLine` nunca é lido.

---

## 2. Decisões de arquitetura

### 2.1 Onde a CLI roda

| Opção | Como funciona | Prós | Contras |
|---|---|---|---|
| **A. REPL in-process** | O servidor e o prompt no mesmo processo; comandos chamam métodos direto | zero IPC, zero dependência nova, implementa em horas | só funciona no terminal que subiu o servidor; fechar o terminal mata o áudio |
| **B. Daemon + cliente** | Processo separado escuta num pipe local; `micshare-pc status` conecta | controle de qualquer terminal, permite `restart` real, base para serviço/auto-start | mais código: protocolo local, token, ciclo de vida do daemon |
| **C. Híbrido (escolhido)** | Fase 1 = A; Fase 2 adiciona B sem quebrar A | entrega valor rápido e evolui sem retrabalho | duas superfícies de comando para manter (mesmo registry resolve) |

**Decisão:** C. O *command registry* é único (`src/cli/commands.ts`); o transporte muda (stdin vs pipe), o comando não.

### 2.2 Transporte do controle local (Fase 2)

- **Windows:** named pipe `\\.\pipe\micshare-pc-<USERNAME>` via `net.createServer(path)`.
  - Motivo: sem porta, sem conflito, ACL herdada do usuário (outros usuários da máquina não conectam).
- **Fallback (Linux/macOS ou se o pipe falhar):** TCP `127.0.0.1:41237` + token obrigatório.
- **Formato:** JSON Lines (1 objeto por linha), request/response com `id`.

```jsonc
// cliente → servidor
{ "id": 1, "cmd": "status", "args": {} }
{ "id": 2, "cmd": "disconnect", "args": { "session": "all" } }

// servidor → cliente
{ "id": 1, "ok": true, "data": { /* ServerStatus */ } }
{ "id": 2, "ok": false, "error": { "code": "no_such_session", "message": "sessão ab12 não existe" } }
```

- **Auth:** primeiro frame `{ "id": 0, "cmd": "auth", "args": { "token": "<hex>" } }`. Token de 32 bytes gerado no boot em `%LOCALAPPDATA%\Micshare\admin.token` (permissão só do usuário). No Windows o pipe já basta; o token protege o fallback TCP.
- **Nunca** expor comandos administrativos no WS da porta 41236 — aquele canal é do celular e não tem auth real.

### 2.3 Estados e efeitos

| Comando | Efeito no áudio | Derruba o celular? |
|---|---|---|
| `mute on` | passa a escrever silêncio no sink (jitter continua drenando) | não |
| `volume 1.5` | ganho aplicado no PCM antes de escrever (clamp int16) | não |
| `device "CABLE"` | fecha e reabre o sink PortAudio | não (UDP continua) |
| `disconnect` | envia `{t:'bye'}` e fecha o WS da sessão | sim, só aquela sessão |
| `restart --sink` | reabre apenas o sink | não |
| `restart --all` | fecha sink+WS+beacon+UDP e reabre | sim (cliente reconecta pelo beacon) |
| `stop` | shutdown gracioso completo | sim |

---

## 3. Referência de comandos

### 3.1 Subcomandos (não interativos)

```bash
micshare-pc                          # = run: sobe o servidor + REPL (comportamento atual + prompt)
micshare-pc run [flags]              # idem, explícito
micshare-pc status [--json]          # consulta o daemon; se não houver, sobe efêmero e reporta "parado"
micshare-pc devices [--json]         # lista saídas de áudio
micshare-pc ctl <cmd> [args] [--json]# envia comando ao daemon (fase 2)
micshare-pc daemon start|stop|status # gerencia o daemon (fase 2)
micshare-pc --list-devices           # compat: alias de devices
micshare-pc --install-vbcable        # compat
micshare-pc --help | --version
```

Flags globais mantidas: `--port N`, `--control-port N`, `--beacon-port N`, `--device "substr"`, `--name NAME`, `--pairing-code CODE`, `--verbose`, `--json`, `--log-file PATH`.

### 3.2 Comandos do REPL

| Comando | Args | Saída |
|---|---|---|
| `status` | — | uptime, PID, portas, IPs, device, codec, sessões, mute/volume, fps/loss/buffer |
| `stats` | `[--watch]` | `received, lost, lossPct, gaps, underruns, fastForwards, flushes, bufferMs, fps` (janela de 1 s) |
| `clients` | — | tabela: `id, ip, codec, conectado há, último stats` |
| `devices` | — | id, nome, canais; marca o atual |
| `device` | `<substring>` | reabre o sink; erro claro + rollback se falhar |
| `mute` | `[on\|off\|toggle]` | estado atual |
| `volume` | `<0..4>` ou `+0.1`/`-0.1` | valor aplicado |
| `disconnect` | `[<sessionId>\|all]` | quantas sessões foram encerradas |
| `restart` | `[--sink\|--all]` | tempo de restart e estado final |
| `pair` | `[rotate]` | código atual / novo código (rotaciona e reinicia o beacon) |
| `beacon` | `[on\|off\|interval <ms>]` | estado |
| `log` | `[on\|off]` | liga/desliga o stream de log no terminal |
| `monitor` | — | dashboard 1 Hz (ANSI); `q`/Ctrl+C volta ao prompt **sem** parar o servidor |
| `help` | `[cmd]` | ajuda |
| `stop` \| `quit` \| `exit` | — | shutdown gracioso |

Todos aceitam `--json` (no REPL, `status --json` imprime o objeto cru).

### 3.3 Exemplo de `status`

```
micshare-pc 0.1.0 · pid 5132 · uptime 02:14:07
portas      áudio 41235/udp · controle 41236/ws · beacon 41234/udp
endereços   192.168.0.12, 10.0.0.5
device      [22] CABLE Input (VB-Audio Virtual Cable) · 2ch · pedido "CABLE Input"
codec       opus        mute off        volume 1.00
sessões     1 · ab12cd34 (192.168.0.44, opus, há 12m)
áudio       fps 99.8 · loss 0.4% · buffer 30ms · gaps 3 · underruns 0
beacon      on (1000ms) · pareamento desligado
```

---

## 4. Modelo de estado

`src/serverState.ts` (novo) — tipo único consumido por REPL, JSON e daemon:

```ts
export interface SessionInfo {
  id: string;
  ip: string;
  codec: 'pcm' | 'opus';
  connectedAt: number;      // epoch ms
  lastStatsAt: number | null;
}

export interface ServerStatus {
  version: string;
  pid: number;
  startedAt: number;
  uptimeMs: number;
  ports: { audio: number; control: number; beacon: number };
  addresses: string[];
  device: { id: number; name: string; channels: number; requested: string | null } | null;
  codec: 'pcm' | 'opus';
  mute: boolean;
  volume: number;
  beacon: { running: boolean; intervalMs: number; pairingEnabled: boolean };
  sessions: SessionInfo[];
  metrics: MetricsSnapshot;   // + janela de 1 s
}
```

Regra: **uma** fonte de verdade para sessões (`Map<sessionId, SessionInfo>` no `AudioServer`); `ControlServer` recebe callbacks e reporta IP/codec, mas não mantém contador próprio.

---

## 5. Mudanças por arquivo

| Arquivo | Ação | Detalhe |
|---|---|---|
| `src/cli/commands.ts` | **novo** | registry `{ name, args, help, run(ctx) }`; mesma função serve REPL e daemon |
| `src/cli/repl.ts` | **novo** | `readline` + histórico em memória, `Tab` completa comandos, `Ctrl+C` cancela linha / 2× encerra |
| `src/cli/format.ts` | **novo** | tabela/ANSI com fallback sem cor (`NO_COLOR`, `--json`) |
| `src/cli/adminServer.ts` | **novo** (F2) | named pipe / TCP loopback, token, JSON Lines |
| `src/cli/adminClient.ts` | **novo** (F2) | connect + request/response com timeout de 2 s |
| `src/serverState.ts` | **novo** | tipos acima + helpers de formatação de duração |
| `src/audioServer.ts` | alterar | `getStatus()`, `setMute()`, `setVolume()`, `restart(scope)`, `disconnect(id\|'all')`, `setDevice()`, registry de sessões, `broadcastStats` a 1 Hz, ganho/mute no loop de 10 ms, `reset()`, corrigir `checkVBCableAvailable` |
| `src/control.ts` | alterar | `audioPort` no config; `listSessions()`, `disconnectSession(id)`, `broadcastBye()`; validar `hello.token` quando pareamento ativo; remover contador interno duplicado |
| `src/sink.ts` | alterar | `setGain()`, `currentDevice()`, `reopen(substr)` com rollback; aplicar ganho no `write()` |
| `src/metrics.ts` | alterar | além do acumulado, janela deslizante de 1 s (ring buffer de 100 amostras) para fps/loss "agora" |
| `src/discovery.ts` | alterar | `setInterval(ms)`, `setPairing(enabled, code)`, `isRunning()` |
| `src/index.ts` | alterar | `parseArgs` do `node:util`, dispatch de subcomandos, `--json`, `--version`, `--log-file` |
| `src/fakeClient.ts` | alterar | aceitar `--host/--port/--frames/--drop/--hello` (para testar `disconnect` e `stats` via WS) |
| `src/cli/commands.test.ts` | **novo** | parsing de args, formatação, erros |
| `src/admin.test.ts` | **novo** (F2) | sobe servidor em porta efêmera, testa auth, status, restart, disconnect |
| `README.md` / `CLAUDE.md` | alterar | seção "CLI" apontando para este doc |
| `docs/plano-cli.md` | este arquivo | atualizar checklist ao fim de cada fase |

Não mexer em `packages/protocol`: o protocolo admin é **local e privado**, não deve vazar para o app mobile.

---

## 6. Fases

### Fase 1 — Estado + REPL in-process (0,5–1 d)

| # | Tarefa | Dep |
|---|---|---|
| C1.1 | `serverState.ts` + `getStatus()` no `AudioServer` | — |
| C1.2 | Registry único de sessões (IP, codec, `connectedAt`) e fim do contador duplicado | C1.1 |
| C1.3 | `setMute`/`setVolume` reais (silêncio e ganho no loop de 10 ms) | C1.1 |
| C1.4 | `disconnectSession` / `disconnectAll` (envia `bye`, fecha WS) | C1.2 |
| C1.5 | `broadcastStats` a 1 Hz + janela de 1 s no `MetricsCollector` | C1.2 |
| C1.6 | `commands.ts` + `repl.ts` + `format.ts`; comandos `status, stats, clients, devices, mute, volume, disconnect, help, stop` | C1.1–C1.5 |
| C1.7 | Corrigir `checkVBCableAvailable` (ESM) e `welcome.audioPort` | — |
| C1.8 | Testes de parsing/formatação + smoke manual com `fakeClient` | C1.6 |

**DoD:** com o servidor rodando, `status`, `clients`, `mute on/off`, `volume 2`, `disconnect all` e `stop` funcionam; mutar o áudio silencia de fato a saída do VB-Cable; `npm --prefix packages/pc run test` verde.

**Status (30/10/2026): concluída.** C1.1–C1.8 implementadas; `tsc --noEmit` limpo e 41 testes verdes. O smoke test automatizado (portas 42235/42236/42234, `fakeClient --hello`) validou `status`, `stats`, `clients`, `mute on/off`, `volume`, `devices`, `disconnect all`, `restart --sink` e `stop` (exit 0). O device `CABLE Input` não pôde ser reaberto porque um servidor antigo elevado (PID 11360) o mantém ocupado — o teste usou `Mapeador de som`; a validação auditiva com VB-Cable fica pendente de encerrar aquele processo. `integration.test.ts` continua sendo teste manual (não roda no `npm test`).

### Fase 2 — Daemon + controle externo (1 d)

| # | Tarefa | Dep |
|---|---|---|
| C2.1 | `adminServer.ts` (pipe + fallback TCP) com token e JSON Lines | F1 |
| C2.2 | `adminClient.ts` + `micshare-pc ctl <cmd>` e `micshare-pc status` | C2.1 |
| C2.3 | `restart --sink` / `restart --all` idempotente (`stop` + `reset` + `start`) | C2.1 |
| C2.4 | `device <substr>` em runtime com rollback | C2.3 |
| C2.5 | `daemon start|stop|status` (spawn desacoplado, PID file em `%LOCALAPPDATA%\Micshare`) | C2.1 |
| C2.6 | `--json` em todos os comandos + exit codes (`0` ok, `1` erro, `2` servidor parado) | C2.2 |
| C2.7 | Testes de integração do canal admin | C2.2 |

**DoD:** em dois terminais, `micshare-pc daemon start` + `micshare-pc ctl restart --sink` funciona; `micshare-pc status --json` é consumível por script; restart não deixa porta órfã (`Get-NetUDPEndpoint -LocalPort 41235` aponta para o novo PID).

**Status (30/10/2026): concluída.** `AdminServer`/`AdminClient` (named pipe + fallback TCP 41237, token de 32 bytes em `%LOCALAPPDATA%\Micshare\admin.token`), `daemon start|stop|status` com PID em `daemon.json`, `status`/`ctl` externos com exit codes 0/1/2. Validado manualmente: `daemon start` → `status` (texto e JSON) → `ctl clients` → `ctl mute on` → `ctl volume 2` → `ctl restart --sink` → `ctl restart --all` → `ctl disconnect all` (sessão `f069a770` encerrada) → `daemon stop` → `status` exit 2, sem porta órfã. Testes: `admin.test.ts` cobre auth, erro estruturado e `stop` (45 verdes no total).

### Fase 3 — Operação e acabamento (0,5–1 d)

| # | Tarefa | Dep |
|---|---|---|
| C3.1 | `monitor` (dashboard 1 Hz, sai sem parar o servidor) | F1 |
| C3.2 | `pair rotate` + `beacon on/off/interval` + validação de token no `hello` | F1 |
| C3.3 | `log on/off` e `--log-file` | F2 |
| C3.4 | Autocomplete, histórico, `help <cmd>`, mensagens de erro padronizadas | F1 |
| C3.5 | Atualizar `README.md`, `CLAUDE.md` e este doc | F2 |
| C3.6 | Checklist manual completo (abaixo) em Windows com VB-Cable | todas |

**DoD:** doc atualizado, checklist executado e registrado no fim deste arquivo.

---

## 7. Testes

### Automatizados

- `commands.test.ts`: parsing (`volume +0.1`, `device "CABLE Input"`, comando inexistente), formatação de duração/bytes, `--json` não emite ANSI.
- `admin.test.ts`: auth sem token → `unauthorized`; `status` retorna shape válido; `restart --sink` mantém porta UDP; `disconnect all` fecha WS (usar `fakeClient --hello`).
- Regressão: `jitterBuffer.test.ts` e `integration.test.ts` continuam passando.

### Manual (Windows + VB-Cable)

1. `npm run dev` → prompt aparece e servidor sobe.
2. `status` → device = `CABLE Input`, portas 41235/41236/41234.
3. `fakeClient --hello` → `clients` mostra 1 sessão com IP e codec.
4. `mute on` → tom do `fakeClient` para no VB-Cable; `mute off` → volta.
5. `volume 0.5` / `volume 2` → volume muda audivelmente, sem clipping.
6. `disconnect all` → celular volta para a tela de descoberta; `clients` vazio.
7. `device "Fones"` → áudio migra para o fone; `device "CABLE Input"` volta.
8. `restart --all` → PID muda, celular reconecta em ≤ 3 s pelo beacon.
9. `monitor` → `q` volta ao prompt com áudio ainda tocando.
10. `stop` → processo encerra e `Get-NetUDPEndpoint -LocalPort 41235` vazio.

---

## 8. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Reabrir PortAudio no Windows falhar com device em uso | média | `reopen()` com try/catch + rollback para o device anterior e erro explícito |
| `restart --all` deixar porta UDP presa (TIME_WAIT / socket não fechado) | média | `close()` + espera do evento `close` antes de reabrir; teste C2.7 |
| Contagem de sessão duplicada/negativa (bug atual) | alta se não tratar | registry único + teste de `bye` seguido de `close` |
| Ganho em int16 gerar clipping | média | clamp em `[-32768, 32767]` e teste com onda full-scale |
| Pipe com ACL permissiva | baixa | validar `icacls` do pipe; token obrigatório no fallback TCP |
| REPL bloqueando o event loop | baixa | `readline` é assíncrono; nenhum comando faz I/O síncrono pesado |
| Divergência entre CLI e `pc-ui` | média | documentar o contrato (`ServerStatus` + tabela de comandos) como referência para o Rust |

---

## 9. Fora de escopo

- Interface gráfica (é o `pc-ui`).
- Autenticação forte no canal do celular (pareamento 6 dígitos já existe no protocolo, será só ligado).
- Instalar como serviço do Windows / auto-start no boot (fica para depois da Fase 3).
- Gravação de áudio, seleção de codec em runtime, telemetria remota.

---

## 10. Ordem sugerida de execução

```
C1.1 ─┬─ C1.2 ─┬─ C1.4 ─┐
      ├─ C1.3 ─┤        ├─ C1.6 ─ C1.8 ─┐
      └─ C1.5 ─┘        │               │
C1.7 ───────────────────┘               │
                                        ├─ C2.1 ─┬─ C2.2 ─┬─ C2.6 ─ C2.7 ─┐
                                        │        └─ C2.5 ─┘               │
                                        ├─ C2.3 ─ C2.4 ───────────────────┤
                                        │                                ├─ C3.x ─ DoD
                                        └─ C3.1 ─────────────────────────┘
```

Caminho crítico: **C1.1 → C1.2 → C1.6 → C2.1 → C2.2 → C3.6**.

---

## 11. Checklist de aceite final

- [ ] `micshare-pc status` responde em < 200 ms com servidor rodando e em < 1 s com servidor parado (exit code 2).
- [ ] `mute`, `volume`, `device`, `disconnect`, `restart`, `stop` com efeito real e mensagem de erro clara em falha.
- [ ] `--json` em todos os comandos, sem ANSI, validável com `ConvertFrom-Json`.
- [ ] Nenhuma porta órfã após `restart`/`stop`.
- [ ] `npm --prefix packages/pc run test` e `npm run typecheck` verdes.
- [ ] `README.md` e `CLAUDE.md` apontando para este documento.
- [ ] Checklist manual da seção 7 executado e anotado abaixo.

### Registro de execução

| Data | Fase | Resultado | Notas |
|---|---|---|---|
| 30/10/2026 | F1 | concluída | `tsc --noEmit` limpo, 41 testes verdes, smoke 14/14 (portas alternativas). Falta validação auditiva no VB-Cable (device ocupado por PID 11360). |
| 30/10/2026 | F2 | concluída | Daemon + `status`/`ctl` externos, named pipe/TCP + token, exit codes 0/1/2. 45 testes verdes; smoke externo com `fakeClient --hello` e `disconnect all`. |
