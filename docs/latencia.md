# Metodologia de Medição de Latência — Micshare

Este documento define como medir a latência ponta a ponta (célular → Wi-Fi → PC → cabo virtual → app consumidor) de forma reproduzível.

## Por que não usar apenas logs

A latência real inclui o cabo virtual (VB-CABLE/PipeWire/BlackHole) e o buffer do app consumidor (Discord, OBS, jogo). Logs internos mostram apenas `captureTs → jitter.pop()`, sem o caminho final. O número publicado deve ser **acústico ou de arquivo**, não estimado.

---

## Método A — Referência acústica (recomendado para release)

### Equipamento
- PC com Micshare rodando + Discord/OBS gravando
- Celular com app Micshare transmitindo
- Segundo celular (ou gravador) posicionado a ~30 cm do alto-falante do PC

### Procedimento
1. No PC: inicie gravação no Discord/OBS (duas trilhas: entrada do Micshare + microfone do PC apontado para o celular)
2. No celular: toque um **bipe curto** (arquivo de teste 1 kHz, 100 ms, -6 dBFS) enquanto o app transmite
3. Pare a gravação
4. No editor de áudio (Audacity, Reaper, etc.): meça o delta entre o onset do bipe na **trilha do microfone do PC** (som acústico vindo do celular) e o onset na **trilha do Micshare** (sinal processado)
5. Repita **5 vezes** por cenário

### Cenários
| Cenário | Wi-Fi | Buffer alvo | Observação |
|---|---|---|---|
| A1 | 5 GHz (RSSI > -50 dBm) | 30 ms (padrão) | Melhor caso |
| A2 | 2.4 GHz (RSSI > -60 dBm) | 30 ms | Caso realista |
| A3 | 5 GHz | 10 ms (mínimo) | Trade-off qualidade/latência |
| A4 | 2.4 GHz com micro-ondas ligado | 30 ms | Stress |

### Aceitação
- **Média** < 150 ms em todos os cenários
- **p95** < 180 ms
- Sem cliques/estalos audíveis nas repetições

---

## Método B — Por software (diagnóstico diário)

Útil durante desenvolvimento para ver tendências sem setup acústico.

### Procedimento
1. No PC: rode o servidor com `--verbose`
2. No celular (ou fake client): transmita frames com `captureTs` sincronizado via NTP local ou `Date.now()` relativo ao boot
3. No receptor: a cada frame, calcule `latencyMs = now() - captureTs + clockOffset`
4. `clockOffset` estimado via handshake WebSocket (`welcome` traz `targetBufferMs`, usa-se RTT/2 do WS como aproximação)
5. Colete 1000 amostras, descarte as primeiras 100 (warm-up)

### Limitações conhecidas
- Erro de ±1 frame (10 ms) + jitter de rede + erro de sincronismo de relógio (até ~5 ms em LAN)
- **Não substitui** o Método A para números de release

---

## Relatório de resultados (template)

```
## Micshare Latency Report — v0.1 — YYYY-MM-DD

Hardware: PC (Windows 11, VB-CABLE), Celular (Pixel 7a / iPhone 14)
Rede: TP-Link AX50, canal 36 (5 GHz) / canal 6 (2.4 GHz)

| Cenário | Média (ms) | p95 (ms) | Amostras | Notas |
|---|---|---|---|---|
| A1 5GHz padrão | 98 | 112 | 5 | |
| A2 2.4GHz padrão | 124 | 148 | 5 | |
| A3 5GHz buffer=10ms | 78 | 95 | 5 | Ocasional underrun |
| A4 2.4GHz stress | 142 | 175 | 5 | |

Veredito: ✅ PASS / ❌ FAIL
```

---

## Automação futura

Quando houver CI com hardware real:
- Script Python + `sounddevice` no PC para capturar loopback + microfone
- `adb` / `idevice` para disparar bipe no celular
- Cálculo automático de onset via detecção de energia (threshold -40 dBFS)
- Publicar artifact no CI