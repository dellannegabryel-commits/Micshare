# Micshare

Microfone sem fio: o celular vira microfone de entrada do PC pela rede local, com baixa latência e zero configuração.

```
celular (React Native) ──UDP/Wi-Fi──> PC (Node + TypeScript) ──> cabo virtual ──> Discord / OBS / jogos
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/arquitetura.md`](docs/arquitetura.md) | protocolo de áudio (header binário), jitter buffer, controle via WebSocket, descoberta, roteamento para VB-CABLE/PipeWire/BlackHole, orçamento de latência, decisões e riscos |
| [`docs/roadmap.md`](docs/roadmap.md) | fases 0–5 com gates verificáveis (~6 semanas até MVP utilizável) |
| [`docs/sprint-01.md`](docs/sprint-01.md) | plano da sprint atual (PoC de áudio), tarefas, DoD e checklist de teste |
| [`docs/plano-cli.md`](docs/plano-cli.md) | plano da CLI de controle do PC: status, mute/volume, disconnect, restart, daemon local |
| [`documenta_o_de_arquitetura_microfone_p2p.md`](documenta_o_de_arquitetura_microfone_p2p.md) | briefing original |

## Estado

PoC de áudio (Sprint 01) funcionando: servidor UDP + jitter buffer + saída PortAudio/VB-Cable, controle WebSocket e beacon de descoberta. A CLI de controle do PC tem REPL in-process (Fase 1) e canal administrativo local com daemon (Fase 2); a Fase 3 (monitor/pareamento) está descrita em [`docs/plano-cli.md`](docs/plano-cli.md).

## CLI do PC

```bash
npm --prefix packages/pc run dev                 # sobe o servidor e abre o prompt
npm --prefix packages/pc run dev -- --device "CABLE Input" --verbose
npm --prefix packages/pc run dev -- devices      # lista as saídas de áudio

# controle externo (Fase 2), de qualquer terminal:
npm --prefix packages/pc run dev -- daemon start --device "CABLE Input"
npm --prefix packages/pc run dev -- status            # exit 2 se o servidor estiver parado
npm --prefix packages/pc run dev -- status --json     # contrato ServerStatus
npm --prefix packages/pc run dev -- ctl mute on
npm --prefix packages/pc run dev -- ctl restart --sink
npm --prefix packages/pc run dev -- daemon stop
```

O daemon usa named pipe `\\.\pipe\micshare-pc-<USUARIO>` (fallback TCP `127.0.0.1:41237`) com token em `%LOCALAPPDATA%\Micshare\admin.token`. Exit codes: `0` ok, `1` erro, `2` servidor parado.

No prompt (`micshare>`):

| Comando | Efeito |
|---|---|
| `status` / `stats` / `clients` | estado do servidor, métricas de 1 s e sessões conectadas |
| `devices` / `device <substr>` | lista e troca a saída de áudio em runtime (com rollback) |
| `mute [on\|off\|toggle]` | silencia de fato a saída (o jitter continua drenando) |
| `volume <0..4 \| +0.1 \| -0.1>` | ganho aplicado no PCM, com clamp em 16 bits |
| `disconnect [<id>\|all]` | envia `bye` e fecha a sessão do celular |
| `restart [--sink\|--control\|--beacon\|--all]` | reinicia partes do servidor sem matar o processo |
| `pair [on\|off\|rotate]` / `beacon [on\|off\|interval <ms>]` | pareamento e descoberta |
| `help` / `stop` | ajuda e shutdown gracioso |

Qualquer comando aceita `--json` (`status --json`) para script. Testes: `npm --prefix packages/pc test`.

## Stack

- **PC:** Node 24 + TypeScript, `dgram` (áudio), `ws` (controle), `naudiodon2` (saída via PortAudio).
- **Mobile:** React Native + TypeScript, `react-native-audio-api` (captura PCM), `react-native-udp` (transporte).
- **Cabo virtual (obrigatório para uso real, não para o PoC):** VB-CABLE (Windows), PipeWire (Linux), BlackHole (macOS).

## Kanban

```bash
hermes kanban list          # board micshare
```

Tarefas da Sprint 01 em `ready`, o gate (S1.8) e as fases seguintes em `todo`, presos por dependência.

## Limitações conhecidas do MVP

- Sem criptografia: o áudio trafega em claro na LAN (ver `docs/arquitetura.md` §10).
- Depende de cabo virtual instalado no PC para que o sistema enxergue um microfone.
- Redes com isolamento de cliente (AP corporativo/guests) impedem descoberta e frequentemente o áudio — usar IP manual quando aplicável.
# trigger
# trigger
# trigger
# trigger 2
