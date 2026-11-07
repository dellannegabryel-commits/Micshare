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

### Como funciona (implementado em v0.5.0)

O celular mede o RTT pelo canal de controle e publica o **offset** entre o seu
relógio e o do PC:

1. O celular envia `ping { id, t0Ms, offsetMs }` a cada 2 s (`t0Ms` = relógio do
   celular no domínio do `capture_ts`, u32).
2. O PC responde `pong { id, t0Ms, t1Ms }` (`t1Ms` = relógio monotônico do PC).
3. O celular calcula `rtt = t2 - t0` e `offset = t1 - t0 - rtt/2`, e devolve o
   offset no **ping seguinte**.
4. O PC mede, a cada frame, `latency = now_pc - (capture_ts + offset)` e guarda
   uma janela de 200 amostras (mediana e p95).

O offset é publicado no domínio do `capture_ts` (u32), então o wrap de 49,7
dias do relógio do celular se cancela junto com o do `capture_ts` — o PC não
precisa contar epochs.

Onde aparece: painel do PC (`Latência (rede)` e `Latência p95`) e no app
Android (`Latência` e `Latência p95`), com o mesmo número dos dois lados.

### O que o número **exclui**

O número mede só o trecho **captura → chegada no PC**. Não inclui:

| Trecho | Custo típico |
|---|---|
| FIFO interno do `AudioRecord` | 0–80 ms (reduzido no v0.5.0) |
| VB-Cable | 10–30 ms |
| Buffer do Discord/OBS | 10–40 ms |
| Caminho acústico (bipe no celular → microfone do PC) | 5–20 ms |

A latência **até a reprodução** é aproximadamente `latência + bufferMs`.

### Limitações conhecidas
- Erro ≈ `rtt/2` (1–10 ms em LAN) + deriva entre os cristais dos relógios.
- Se o PC reiniciar, o número fica inválido por até 2 s (o próximo ping
  re-sincroniza).
- Medidas implausíveis (offset desatualizado) são descartadas, não publicadas.
- **Não substitui** o Método A para números de release: é limite inferior.

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