# Arquitetura — Micshare (microfone P2P em rede local)

Versão 0.1 · escopo de MVP · complementa `documenta_o_de_arquitetura_microfone_p2p.md` (briefing original), ao qual corrige nos pontos marcados com **Δ**.

## 1. Objetivo

Transformar um celular em microfone de entrada do PC, via Wi-Fi local, com latência de ponta a ponta **< 150 ms**, descoberta automática e controles de mute/volume. O PC continua enxergando um microfone normal (via cabo virtual), então funciona em Discord, OBS, jogos e reuniões sem plugin.

### Não-objetivos do MVP
- Áudio pela internet (fora da LAN), multi-sala, N clientes simultâneos.
- Criptografia em trânsito (TLS/DTLS). Ver §10.
- Cancelamento de eco/ruído, AGC, supressão de ruído — o SO do celular já faz na captura.
- Driver próprio de áudio no kernel.

## 2. Topologia

```
┌────────────┐                                ┌──────────────────────────────┐
│  Celular   │  1) beacon UDP broadcast :41234 │  PC (Node 24, TypeScript)    │
│  (RN/TS)   │ <──────────────────────────────│  beacon + descoberta         │
│            │                                │                              │
│ captura    │  2) WebSocket :41236 (controle) │  servidor controle           │
│ PCM 10 ms  │ <─────────────────────────────>│                              │
│            │                                │                              │
│            │  3) UDP :41235 (áudio, 1 via)   │  jitter buffer               │
│            │ ──────────────────────────────>│  → sink de áudio (PortAudio) │
└────────────┘                                │  → "CABLE Input (VB-Audio)"  │
                                              └───────────────┬──────────────┘
                                                              │ CABLE Output (device de gravação)
                                                              ▼
                                              Discord / OBS / jogo / reunião
```

Três canais independentes, cada um com o transporte que a sua garantia exige:

| Canal | Transporte | Porta | Garantia | Consequência de falha |
|---|---|---|---|---|
| Descoberta | UDP broadcast | 41234 | eventual (1 Hz) | usuário digita IP / lê QR |
| Controle | WebSocket (TCP) | 41236 | entrega ordenada | mute/volume não chegam, estado divergente |
| Áudio | UDP unicast | 41235 | nenhuma, seq + ts no header | 1 frame perdido, mascarado por PLC |

**Δ correção do briefing:** o briefing sugere que o app mobile anuncie via mDNS e o PC escute; invertemos — **é o PC que anuncia** (ele é o servidor, tem IP estável e é um só) e o app escuta. Também trocamos mDNS por **UDP broadcast como mecanismo primário**: mDNS em React Native exige biblioteca nativa + `MulticastLock` no Android e é a maior fonte de bugs de descoberta em LAN. O beacon é ~40 linhas de JS puro sobre `react-native-udp` e funciona em iOS e Android. mDNS fica como camada opcional de compatibilidade (Fase 2.5).

## 3. Protocolo de áudio

### 3.1 Formato no PoC
PCM 16-bit little-endian, mono, 48 kHz, blocos de **10 ms** (480 amostras = 960 B).

**Δ correção do briefing:** blocos de 20 ms em PCM 48 kHz mono dariam 1920 B de payload; com header, o datagrama passa de 1900 B e **estoura o MTU de 1472 B útil**, gerando fragmentação IP — exatamente o pior caso em Wi-Fi (basta 1 fragmento perdido para descartar o frame inteiro, e a latência de reordenação explode). Com 10 ms o datagrama fica em 976 B. Quando o consumo de banda importar, Opus a 20 ms resolve (~100 B/frame, ver §3.4).

### 3.2 Header (16 B, big-endian)

| offset | size | campo | notas |
|---|---|---|---|
| 0 | 2 | `magic` = `0x4D53` ("MS") | descarta pacote de outra aplicação |
| 2 | 1 | `version` = 1 | |
| 3 | 1 | `flags` | bit0 = `SILENCE` (PLC), bit1 = `MUTED` |
| 4 | 4 | `seq` u32 | incrementa 1 por frame; base da detecção de perda |
| 8 | 4 | `captureTs` u32 (ms, relógio do celular) | pacing do jitter buffer e estimativa de drift |
| 12 | 2 | `payloadLen` u16 | valida contra o tamanho real do datagrama |
| 14 | 1 | `channels` = 1 | |
| 15 | 1 | `codec` | 0 = PCM s16le, 1 = Opus |

Regra de validação no receptor, antes de qualquer decode: `len === 16 + payloadLen`, `magic` ok, `version === 1`, `payloadLen` entre 2 e 1472. Falha → incrementa contador e descarta. Sem isso um pacote arbitrário na porta entra no buffer de reprodução.

### 3.3 Janela de transmissão
O celular captura em blocos de 10 ms e envia **imediatamente**, sem agrupamento, sem retransmissão, sem retry. `seq` monotônico por sessão. Backpressure não existe (UDP); se o Wi-Fi estiver saturado, o kernel drops e o receptor vê gap — comportamento desejado.

### 3.4 Codec
- **MVP (Fase 1–2):** PCM s16le. Zero CPU, zero dependência nativa de encoder, latência mínima. Banda: 768 kbit/s. Aceitável em LAN 5 GHz.
- **Quando ligar Opus:** ao suportar 2.4 GHz congestionado ou múltiplos clientes. `codec=1` já está no header, então é troca de payload sem mudança de protocolo. Alvo: Opus 48 kHz mono, 24 kbit/s, frame 20 ms, complexidade 5, `OPUS_APPLICATION_VOIP`, sem FEC no MVP (FEC adiciona ~1 frame de latência).

## 4. Jitter buffer e perda

O buffer é o que transforma UDP em áudio audível. Sem ele, jitter de Wi-Fi de 5–20 ms vira estalo; com buffer fixo grande, vira latência inútil.

Implementação: ring buffer circular de amostras, escrito por frame recebido e lido pelo sink em blocos do mesmo tamanho.

Parâmetros:
- Profundidade alvo **adaptativa**: começa em 3 frames (30 ms). A cada 1 s, mede o jitter (`max(captureTs_i − captureTs_{i-1}) − frameMs` em janela de 100 frames) e ajusta alvo entre 2 e 8 frames.
- Fila vazia na leitura → escreve silêncio e **zera o alvo para o mínimo** (sinal de que estamos acima do necessário).
- Fila acima de `alvo + 3` → descarta o frame mais antigo (fast-forward), nunca acumula. Trava de segurança: profundidade > 250 ms → flush total + ressincronização por `seq`.
- Gap de `seq` de n frames → repete o último frame útil com fade linear (PLC zero-order), máximo 3 frames consecutivos; acima disso, silêncio. PLC de ordem zero é 5 linhas e evita o "som robótico de metralhadora" de repetir o mesmo bloco indefinidamente.
- Mudança de `seq` para trás (reordenação tardia) com frame mais velho que a posição de leitura → descarta.

## 5. Canal de controle (WebSocket)

Mensagens JSON, uma por frame de texto. `t` é o discriminador.

Cliente → servidor:
```json
{"t":"hello","v":1,"token":"482913","sampleRate":48000,"channels":1,"codec":"pcm16","frameMs":10}
{"t":"mute","value":true}
{"t":"volume","value":1.2}
{"t":"bye"}
```
Servidor → cliente:
```json
{"t":"welcome","sessionId":"c1f0","audioPort":41235,"targetBufferMs":30}
{"t":"stats","lossPct":0.4,"bufferMs":32,"seqGaps":12,"reconnects":0}
{"t":"error","code":"bad_token","message":"código de pareamento inválido"}
```

Regras:
- `hello` sem `token` válido → `error` + close; o áudio UDP daquele IP é ignorado (o servidor só aceita datagrams do endereço da sessão autenticada).
- `volume` é clampado em `[0, 4]` no servidor; aplicado como multiplicador inteiro com clamp em `int16` (`Math.max(-32768, Math.min(32767, s * v))`), antes do sink. Mute é estado no cliente (para de enviar) **e** no servidor (descarta) — dupla garantia, porque se só o cliente parasse e o app travasse, ficaria áudio fantasma.
- `stats` a 1 Hz, usado pelo app para mostrar perda/buffer (diagnóstico visível para o usuário, não telemetria).
- Queda do WS: cliente reconecta com backoff 250 ms → 5 s; áudio UDP continua fluindo nesse intervalo (mute/volume ficam no último estado conhecido), o que mantém a experiência estável.

**Δ:** o briefing põe mute/volume só no WebSocket. Mantemos, mas o header de áudio carrega `flags.MUTED` como redundância barata.

## 6. Descoberta e pareamento

Beacon: 1 datagrama por segundo em `255.255.255.255:41234` (e no broadcast da sub-rede, para redes com broadcast filtrado), JSON ≤ 200 B:

```json
{"app":"micshare","v":1,"name":"DESKTOP-GABRY","audioPort":41235,"ctrlPort":41236,"pair":true,"code":"482913"}
```

App: escuta 41234, monta lista de PCs (dedupe por `name` + IP, TTL 3 s), usuário toca no PC desejado, app abre WS, manda `hello` com o código. Código de 6 dígitos rotaciona a cada boot do servidor e é exibido na janela/terminal do PC.

Fallback quando o beacon não passa (AP com isolamento de cliente, rede corporativa, VLAN): digitar IP:porta manualmente, ou QR code gerado no PC (Fase 2.5). Isolamento de cliente é o caso em que **nenhuma** descoberta funciona — a documentação precisa dizer isso explicitamente, porque o usuário vai culpar o app.

## 7. Saída para o SO (cabo virtual)

Nenhum sistema operacional deixa um app de usuário se registrar como microfone. O caminho é o cabo virtual: o app escreve em um dispositivo de **saída** e o SO expõe um dispositivo de **entrada** espelhado.

| OS | Cabo | App escreve em | Sistema lê de |
|---|---|---|---|
| Windows | VB-CABLE | `CABLE Input (VB-Audio Virtual Cable)` | `CABLE Output` |
| Linux | PipeWire | `micshare_sink` (null sink) | `micshare_sink.monitor` |
| macOS | BlackHole 2ch | `BlackHole 2ch` | `BlackHole 2ch` |

Detalhes que quebram na prática:
- VB-CABLE é donationware e **não pode ser redistribuído**; o instalador não deve embutir o driver — só detectar, instruir e validar presença (`naudiodon2` lista dispositivos por nome).
- Taxa de amostragem: 48 kHz nos dois lados, mono nos dois lados. Se o Windows estiver em 44,1 kHz, o VB-CABLE reamostra com latência extra e leve degradação — o app deve checar e avisar.
- Custo de latência do cabo: 10–30 ms adicionais, contados no orçamento de §8.
- Nome do dispositivo difere por idioma do Windows; seleção por `index` obtido do match parcial do nome, com fallback para o default do sistema.

## 8. Orçamento de latência

| Etapa | Latência |
|---|---|
| Captura (bloco de 10 ms) | 10 ms |
| Encode + envio JSI/UDP | 1–3 ms |
| Wi-Fi (5 GHz, RSSI > −60 dBm) | 3–15 ms |
| Jitter buffer | 30–50 ms |
| Decode + aplicação de volume | 1–2 ms |
| Buffer do sink (PortAudio) | 10–20 ms |
| VB-CABLE | 10–30 ms |
| **Total** | **65–130 ms** |

Meta do MVP: **< 150 ms** medido pela metodologia da Sprint 1. Referência: AirPods ficam em ~150 ms e são considerados usáveis para fala.

## 9. Estrutura do repositório

```
Micshare/
├── documenta_o_de_arquitetura_microfone_p2p.md   # briefing original
├── docs/
│   ├── arquitetura.md        # este documento
│   ├── roadmap.md            # fases e gates
│   └── sprint-01.md          # plano da sprint corrente
├── packages/
│   ├── protocol/             # header binário, encode/decode, validação, testes
│   │   └── src/{audioFrame.ts,ctrl.ts}
│   └── pc/                   # servidor: beacon, ws, udp, jitter, sink
│       └── src/{index.ts,discovery.ts,control.ts,audioServer.ts,jitterBuffer.ts,sink.ts}
└── mobile/                   # app React Native (0.7x, TS)
    └── src/{App.tsx,discovery.ts,capture.ts,transport.ts,control.ts}
```

`packages/pc` roda como CLI no MVP (`npm --prefix packages/pc run dev`), e só depois ganha UI (Tauri ou painel web local). Não começamos por UI: a UI de um app de áudio é uma tela com 3 controles, o risco está no áudio.

## 10. Segurança e limites de confiança

Modelo de ameaça realista: rede doméstica compartilhada, eventualmente Wi-Fi de escritório ou café.

No MVP:
- Pareamento por código de 6 dígitos, válido por sessão, necessário para o `hello`. Sem ele, o servidor não aceita o UDP daquele par remoto.
- Validação estrita de pacote (§3.2) e de tamanho de mensagem WS (1 KB), limite de `hello` a 5/min por IP.
- Volume e mute clampados; nada vindo da rede é usado como caminho de arquivo ou comando.
- **Sem criptografia.** O áudio trafega em claro na LAN; quem estiver na mesma rede com sniffing consegue ouvir. Aceito para MVP, documentado no README como limitação conhecida.
- Escape: se isso virar requisito, migrar o transporte de áudio para WebRTC (SRTP/DTLS) é a única saída sã — daí a decisão de manter o protocolo de áudio pequeno e substituível.

## 11. Decisões e alternativas descartadas

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Node 24 + TypeScript no PC | Rust/C++ | iteração rápida; CPU de PCM/Opus é irrelevante; a única parte nativa é o PortAudio, já estável |
| `naudiodon2` (PortAudio) para saída | `node-speaker` (sugerido no briefing) | `node-speaker` está sem manutenção e não tem prebuild para Node 24 → obriga toolchain MSVC. `naudiodon2` é fork mantido, com seleção de dispositivo por índice/nome |
| Escolha de dispositivo por nome parcial | assumir dispositivo padrão | sem escolher `CABLE Input` não existe integração com Discord |
| PCM s16le 10 ms no PoC | Opus desde o início | Opus exige lib nativa (addon no RN); no PoC queremos isolar variável. Header já prevê `codec` |
| WebSocket JSON para controle | TCP cru com framing próprio | reconexão, ping/pong e browser-debugging de graça; tráfego é ~10 msg/s |
| Beacon UDP primário | mDNS | ver §2; menos dependência nativa no app |
| CLI antes de UI | Electron/Tauri desde já | ver §9 |
| Sem WebRTC no MVP | WebRTC | ICE/SDP/STUN para uma LAN com 2 pares fixos é complexidade que não paga; reavaliar junto com criptografia |

## 12. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `naudiodon2` sem prebuild para Node 24 no Windows | bloqueia a saída de áudio | validar na tarefa 1.5; fallback `ffplay -f s16le -flags low_delay -probesize 32 -i pipe:0` para o PoC (só dispositivo padrão) |
| Captura PCM no RN exige addon nativo (`react-native-audio-api`) | build mobile mais lento | spike isolado na tarefa 1.3; Expo prebuild + dev client, não Expo Go |
| Jitter de Wi-Fi doméstico (2.4 GHz, vizinhos) | estalos, latência variável | buffer adaptativo, métrica de perda visível no app, recomendação de 5 GHz na doc |
| Isolamento de cliente no AP | descoberta e até o áudio falham | fallback IP manual; documentar como limitação de rede, com teste |
| Atraso de 30–60 ms do caminho celular→PC aparecer como "microfone atrasado" em jogo | percepção de baixa qualidade | número publicado, não escondido; opção de reduzir buffer (trade-off exposto) |
| Nome de dispositivo traduzido no Windows | sink aponta para o dispositivo errado | match por substring + `--list-devices` para o usuário escolher |

## 13. Testes

- **Unitário (obrigatório):** `packages/protocol` — encode/decode round-trip, rejeição de magic/versão/len inválidos; `jitterBuffer` com relógio fake cobrindo reordenação, gap, burst de perda, underrun e flush por profundidade.
- **Integração local:** servidor UDP + cliente fake em `127.0.0.1` enviando 500 frames, assert de frames recebidos / gaps contados / buffer estabilizado.
- **Simulação de rede ruim:** variável `MICSHARE_DROP_PCT=5` e `MICSHARE_JITTER_MS=15` no cliente fake — sem depender de `tc/netem` (não existe no Windows).
- **Manual cross-device:** checklist em `docs/sprint-01.md`, com evidência (log de stats, gravação do áudio no PC).
