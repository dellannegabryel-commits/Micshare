# Sprint 01 — PoC de áudio (Fase 1)

**Objetivo da sprint:** provar que o caminho celular → Wi-Fi → PC produz áudio inteligível com latência < 150 ms, com IP fixo e sem descoberta automática. É a sprint que decide se o produto existe.

Duração: 2 semanas · Board: `micshare` (`hermes kanban list` ou a aba Kanban do app desktop) · Repo: `C:\Users\gabry\workspace\Micshare`

## Escopo

Entra: captura PCM no celular, header binário + validação, servidor UDP com jitter buffer, saída de áudio no PC com seleção de dispositivo, CLI com stats, medição de latência, relatório de gate.

Não entra: descoberta automática, WebSocket de controle, mute/volume, cabo virtual como requisito de aceite, UI, Opus, iOS+Android simultâneos.

## Tarefas

| ID | Tarefa | Depende de | Estimativa |
|---|---|---|---|
| `t_fc537cb0` | S1.1 Scaffold do monorepo (protocol + pc + mobile) | — | 0,5 d |
| `t_ae8bc86f` | S1.3 Spike: captura PCM no celular e envio UDP | S1.1 | 2 d |
| `t_c8175ad8` | S1.2 Protocolo: header binário, validação e testes | S1.1 | 1 d |
| `t_5a7a55da` | S1.4 Servidor UDP + jitter buffer adaptativo | S1.2 | 2,5 d |
| `t_78bb19cd` | S1.5 Saída de áudio no PC (naudiodon2 + dispositivo) | S1.2 | 1 d |
| `t_3cd02f6f` | S1.6 CLI do PC: flags, stats e encerramento limpo | S1.4, S1.5 | 0,5 d |
| `t_b594a297` | S1.7 Metodologia de medição de latência | S1.4, S1.5 | 0,5 d |
| `t_0e3cd5e7` | S1.8 E2E da Fase 1 e decisão go/no-go | todas | 1 d |

No board, S1.8 fica em `todo` até as outras sete fecharem (dependência registrada). F2–F5 também estão em `todo`, presas a S1.8 — é o roadmap visível, não trabalho desta sprint.

## Ordem de execução

```
S1.1 ─┬─ S1.2 ─┬─ S1.4 ─┬─ S1.6 ─┐
      │        └─ S1.5 ─┴─ S1.7 ─┼─ S1.8 (gate)
      └─ S1.3 ───────────────────┘
```

Caminho crítico: **S1.1 → S1.2 → S1.4 → S1.8**. S1.3 (mobile) corre em paralelo com S1.2/S1.4 e é o maior risco técnico da sprint (addon nativo de captura) — começar no dia 1, não no dia 5. S1.5 pode começar assim que S1.2 estiver pronto, usando frames sintéticos (senão a saída fica esperando o celular).

## Definição de pronto da sprint

- [ ] Celular envia 100 frames/s estáveis por 60 s, sem divergência > 1%.
- [ ] PC recebe, passa pelo jitter buffer e reproduz áudio inteligível por 10 min contínuos.
- [ ] Latência média e p95 medidas e registradas: **< 150 ms**.
- [ ] 3% de perda simulada (`MICSHARE_DROP_PCT=3`) sem estalo audível.
- [ ] `npm run typecheck` verde; testes de `protocol` e `jitterBuffer` passando (`node --test`).
- [ ] `docs/sprint-01-resultado.md` escrito com números e veredito go/no-go.

## Checklist de teste manual (S1.8)

1. PC: `npm --prefix packages/pc run dev -- --list-devices` → confirmar dispositivo de saída.
2. PC: `npm --prefix packages/pc run dev -- --device "<substring>" --verbose` → esperar stats a 1 Hz.
3. Celular: app, digitar IP do PC, conectar → conferir contador ≈ 100/s.
4. Ouvir: falar a 30 cm, a 2 m, sussurrar, e ficar em silêncio (verificar que silêncio não vira ruído/estalo).
5. Deixar 10 min rodando com conversa e música; anotar glitches e fps/loss/buffer no minuto 1, 5 e 10.
6. Repetir em 2,4 GHz e em 5 GHz; anotar RSSI de cada um.
7. Repetir com `MICSHARE_DROP_PCT=3`; o áudio deve ficar levemente áspero, não picotado.
8. Medir latência conforme `docs/latencia.md` (5 medições por cenário).
9. Ctrl+C no PC → processo termina, porta 41235 livre (`netstat -ano | findstr 41235` vazio).
10. Reconectar o app sem reiniciar o servidor → áudio volta.

## Riscos da sprint

| Risco | Sinal precoce | Ação |
|---|---|---|
| `react-native-audio-api` não entrega PCM int16 a 10 ms | S1.3 sem callback com 480 amostras | cair para 20 ms + Opus antecipado, ou módulo nativo (custo alto) — decidir até o dia 3 |
| `naudiodon2` sem prebuild para Node 24/Windows | S1.5 falha no install | seguir com `--sink=ffplay` e registrar como dívida |
| Jitter de Wi-Fi doméstico estoura o buffer | loss/gaps altos com RSSI bom | forçar 5 GHz, aumentar alvo do buffer, registrar como limitação |
| Latência medida > 150 ms | p95 acima da meta em S1.7 | cortar buffer para 2 frames e reavaliar antes do gate |
