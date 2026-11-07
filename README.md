# Micshare

O celular vira microfone do PC pela rede local: baixa latência, descoberta automática e o PC enxerga um microfone normal — funciona em Discord, OBS, jogos e reuniões sem plugin.

```
Android (Kotlin + Compose)  ──UDP 41235 (áudio)──▶  PC (Rust + Tauri 2)  ──cpal──▶  VB-Cable  ──▶  Discord / OBS / jogos
        │                            ▲
        └──WS 41236 (controle)──────┘
                     ▲
        PC ──UDP 41234 (beacon broadcast, 1 Hz)──▶ Android (descoberta)
```

- **PC:** app nativo em Rust + Tauri 2 (UI em React 18 + Vite + Tailwind). Instala como MSI ou NSIS.
- **Android:** app em Kotlin + Jetpack Compose. Captura via `AudioRecord`, envia por `DatagramSocket`, controle por WebSocket (Ktor).
- **Áudio:** PCM s16le, 48 kHz mono, frames de 10 ms (480 amostras / 960 B), um datagrama UDP por frame.
- **Qualidade de voz:** AEC/NS no celular via `android.media.audiofx` (na fonte `MIC`), seletor de microfone e PLC limitado com fade no PC — pacote perdido não vira clique.
- **Latência:** medida por software no PC (`ping`/`pong` do celular → `capture → chegada`, mediana e p95 em `stats`) e por bipe de teste (`scripts/onset-diff.py`) para a medição acústica.

## Releases

Baixe os artefatos em [github.com/dellannegabryel-commits/Micshare/releases](https://github.com/dellannegabryel-commits/Micshare/releases).

| Artefato | Plataforma |
|---|---|
| `Micshare-<versão>.apk` | Android (minSdk 23 / Android 6.0+) |
| `Micshare-<versão>_x64-setup.exe` | Windows (NSIS) |
| `Micshare-<versão>_x64.msi` | Windows (MSI) |

O CI (`.github/workflows/release.yml`) compila APK, MSI e NSIS a cada tag `v*.*.*` e anexa os três artefatos na release. A versão atual é `0.5.0`; a última release publicada está em [releases/latest](https://github.com/dellannegabryel-commits/Micshare/releases/latest).

### Publicar uma release

1. Sincronize a versão em todos os manifests (uma fonte de verdade):

   ```bash
   node scripts/set-version.mjs 0.5.0
   node scripts/set-version.mjs --check 0.5.0   # só verifica
   ```

   O script atualiza `Cargo.toml` (somente a seção `[package]`), `Cargo.lock`,
   `tauri.conf.json`, `pc/package.json`, `package.json`, `package-lock.json` e
   `build.gradle.kts` (`versionName` + `versionCode`).

2. Faça o merge para a `main` e crie a tag:

   ```bash
   git tag -a v0.5.0 -m "Micshare v0.5.0"
   git push origin main v0.5.0
   ```

   O CI só publica se a release da tag **ainda não existir** — se já existir,
   ele apenas gera os artefatos e não altera nada no GitHub.

3. Para testar o pipeline sem publicar nada: **Actions → Release → Run
   workflow**, com `publish` desmarcado (dry-run: gera os artefatos, não cria
   a release).

## Como usar

**1. No PC — instale o cabo virtual.** O Micshare escreve o áudio no lado de *playback* do cabo; o par aparece como microfone no sistema:

- Windows: [VB-Cable](https://vb-audio.com/Cable/) (o app tem um atalho que abre a página oficial).
- Linux: PipeWire · macOS: BlackHole.

Requer reiniciar o PC após instalar o driver. Sem o cabo virtual não há como o celular virar microfone.

**2. No PC — rode o app.** Instale o MSI/EXE e abra o Micshare. O servidor sobe sozinho (descoberta + controle + áudio). No seletor de dispositivos, escolha a entrada `CABLE Input` — o app detecta o cabo virtual e o prefere automaticamente.

**3. No Android — instale e conecte.** Instale o APK, abra o app e toque em **Conectar** no PC listado na seção *Servidores na rede*. A captura começa em um serviço de foreground, com notificação persistente. No app dá para escolher a fonte do microfone: em `MIC` o app aplica AEC/NS, em `VOICE_COMMUNICATION` o próprio HAL processa e em `UNPROCESSED` o áudio fica cru. O mute e o volume do celular valem no PC de verdade.

**4. No Discord/OBS — selecione o microfone.** Escolha `CABLE Output` (VB-Audio) como microfone. O PC passa a tratar o celular como qualquer outro microfone.

## Protocolo

Três canais independentes, cada um com a garantia que precisa:

| Canal | Porta | Formato | Uso |
|---|---|---|---|
| Descoberta | UDP 41234 | JSON (beacon ≤ 200 B) | PC anuncia a 1 Hz; celular escuta. Fallback: celular envia `{"t":"probe"}` e o PC responde em unicast |
| Áudio | UDP 41235 | header binário 16 B + PCM s16le | Um datagrama por frame de 10 ms. Só é aceito do IP com sessão de controle ativa (allowlist de IP) |
| Controle | WS 41236 | JSON | Handshake `hello` → `welcome` (traz `muted`/`volume` do PC), mute/volume, `bye`, `stats` a 1 Hz (com `latencyMs` e `latencyP95Ms`) |

**Header de áudio** — 16 bytes big-endian (`docs/arquitetura.md` §3.2):

| Offset | Tam. | Campo | Notas |
|---|---|---|---|
| 0 | 2 | `magic` | `0x4D53` ("MS") — descarta pacote de outra app |
| 2 | 1 | `version` | `1` |
| 3 | 1 | `flags` | bit0 = SILENCE, bit1 = MUTED |
| 4 | 4 | `seq` | u32, +1 por frame (o wrap de u32 é desenrolado no PC) |
| 8 | 4 | `capture_ts` | u32, ms do relógio **monotônico** do celular (`SystemClock.elapsedRealtime`) |
| 12 | 2 | `payload_len` | u16, validado contra o datagrama |
| 14 | 1 | `channels` | `1` (mono) |
| 15 | 1 | `codec` | `0` = PCM s16le, `1` = Opus |

**Jitter buffer** (PC): `BTreeMap` indexado pelo `seq` absoluto (`pc/src-tauri/src/audio/jitter.rs`), com alvo **adaptativo pelo p95** dos deltas de `capture_ts` numa janela de 100 frames (2–8 frames; deltas acima de 4× o frame são descartados como outlier), *fast-forward* quando a fila estoura e *flush* acima de 250 ms. É ele que transforma o jitter do Wi-Fi em áudio estável.

**PLC limitado com fade**: no máximo 3 frames (30 ms) de preenchimento por perda, com rampa linear de 64 amostras — fade-out 1→0 na cauda retida e fade-in 0→1 no frame retomado. Sem isso, cada pacote perdido virava um clique audível.

**Latência por software** (`pc/src-tauri/src/audio/latency.rs`): o celular mede o RTT com `ping`/`pong` e publica o offset entre os dois relógios; o PC mede `capture → chegada` de cada frame e publica mediana e p95 em `stats` (`latencyMs`, `latencyP95Ms`). Para a medição acústica (Método A) o app toca um bipe de teste e `scripts/onset-diff.py` compara o onset das duas trilhas.

## Desenvolvimento

Pré-requisitos: Node 24+ (é o que o CI usa), Rust 1.85+ (edition 2024), JDK 21, Android SDK 35.

### App do PC (Rust + Tauri)

```bash
npm --prefix pc install
npm --prefix pc run tauri:dev      # app completo em modo dev (frontend + Rust)
npm --prefix pc run build          # build do frontend (tsc + vite)
npm --prefix pc run tauri:build    # gera MSI + NSIS
```

Backend Rust isolado:

```bash
cd pc/src-tauri
cargo test                                    # 71 testes
cargo run --example serve                     # servidor sem UI (beacon + controle + áudio)
cargo run --example devices                   # lista os dispositivos de saída
cargo run --example hot_swap                  # valida a troca de dispositivo + rollback
cargo run --example discovery_probe           # testa o probe unicast de descoberta
cargo run --example lossy_client -- --drop-pct 20 --jitter-ms 30 --count 200  # simula rede ruim (valida PLC/fade)
```

### App Android (Kotlin + Compose)

```bash
cd mobile
./gradlew :app:assembleDebug                  # APK de debug
./gradlew :app:installDebug                   # instala no dispositivo conectado
./gradlew :app:assembleRelease                # APK de release (assinado)
./gradlew :app:test                           # testes unitários
```

## Stack

| Camada | Tecnologias |
|---|---|
| **PC — backend** | Rust 1.85 (edition 2024), Tauri 2.12, tokio, tokio-tungstenite, cpal 0.18, byteorder, serde |
| **PC — frontend** | React 18, TypeScript, Vite 5, Tailwind 3, lucide-react, tauri-plugin-store (config persistida) |
| **Android** | Kotlin 1.9.24, Jetpack Compose (BOM 2024.08), Material 3, kotlinx-serialization, DataStore, Ktor 2.3 (WebSocket), Gradle 8.13 |
| **Áudio (PC)** | cpal — WASAPI no Windows, CoreAudio no macOS, ALSA/PipeWire no Linux |
| **Áudio (Android)** | `AudioRecord` → frames PCM s16le de 10 ms; AEC/NS via `android.media.audiofx`; serviço de foreground tipo `microphone` |

## Estrutura do repositório

```
Micshare/
├── pc/                            # servidor PC principal (Rust + Tauri 2)
│   ├── src/                       # frontend React: App.tsx, components/, hooks/, types/
│   └── src-tauri/
│       ├── src/
│       │   ├── audio/             # jitter.rs (BTreeMap + PLC/fade), sink.rs (cpal), latency.rs, resample.rs
│       │   ├── control/           # servidor WebSocket de controle
│       │   ├── discovery/         # beacon UDP (broadcast + probe unicast)
│       │   ├── protocol/          # header binário e mensagens de controle
│       │   ├── server.rs          # orquestração do MicshareServer
│       │   ├── commands.rs        # comandos Tauri expostos à UI
│       │   └── state.rs           # AppState (ciclo de vida do servidor)
│       ├── examples/              # serve, devices, hot_swap, discovery_probe, lossy_client
│       ├── tauri.conf.json
│       └── Cargo.toml
├── mobile/                        # app cliente Android (Kotlin + Compose)
│   └── app/src/main/java/com/micshare/
│       ├── audio/                 # AudioCapture, AudioCaptureService, AudioEffects (AEC/NS),
│       │                          # AudioSourcePlan, CaptureClock, CaptureConfig, FrameAssembler,
│       │                          # MicDevices, StatusThrottle, StreamingStatus, TestTone, WakeLockPolicy
│       ├── network/               # AudioSender (UDP), ControlClient (WS), BeaconListener
│       ├── protocol/              # header e mensagens de controle (espelho do Rust)
│       ├── ui/                   # Compose: MainScreen, DiscoverySection, SessionSection, AudioInputSection
│       └── viewmodel/             # MainViewModel (descoberta → sessão → streaming)
├── assets/
│   └── icon-source.png            # master do ícone (1024x1024) — fonte de todos os derivados
├── scripts/
│   ├── set-version.mjs            # sincroniza a versão em todos os manifests
│   ├── generate-icons.py          # gera os ícones do Tauri e do Android a partir do master
│   ├── install-vbcable.ps1        # instala o driver do cabo virtual (Windows)
│   └── onset-diff.py              # mede o onset do bipe de teste (latência acústica)
├── docs/                          # arquitetura, roadmap, latência, planos
├── .github/workflows/ci.yml       # CI (rust + node + android) em push e pull_request
├── .github/workflows/release.yml  # CI de release (APK + MSI + NSIS) por tag v*.*.*
└── package.json                   # workspace npm (pc)
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/arquitetura.md`](docs/arquitetura.md) | topologia, protocolo de áudio (header binário), jitter buffer, controle via WebSocket, descoberta, sessão de controle (allowlist de IP), roteamento para VB-Cable/PipeWire/BlackHole, orçamento de latência, segurança, riscos |
| [`docs/roadmap.md`](docs/roadmap.md) | fases com gates verificáveis e as decisões de stack (Rust/Tauri no PC, Kotlin/Compose no mobile) |
| [`docs/latencia.md`](docs/latencia.md) | metodologia de medição de latência ponta a ponta (acústica e por software) e template de relatório |
| [`docs/sprint-01-resultado.md`](docs/sprint-01-resultado.md) | resultado da sprint 1 e evidência de go/no-go |
| [`docs/plano-correcoes-painel-controle.md`](docs/plano-correcoes-painel-controle.md) | plano das correções do painel de controle (mute/volume, `isDefault`, discovery, hot-swap de dispositivo) |
| [`docs/documenta_o_de_arquitetura_microfone_p2p.md`](docs/documenta_o_de_arquitetura_microfone_p2p.md) | briefing original |

## Estado atual

Fases 0–5 do roadmap concluídas: PoC de áudio, descoberta zero-config, controles, integração com cabo virtual e app nativo do PC. O painel de controle do PC está funcional — mute/volume aplicados no pipeline de áudio, `isDefault` real, discovery plugado na UI, logs e reconexões reais, e **hot-swap do dispositivo de saída** com rollback transacional (trocar o cabo sem derrubar a saída ativa).

A v0.5.0 fecha a **Fase 6 — Voice Quality**: AEC/NS via `android.media.audiofx` na fonte `MIC`, seletor de microfone, leitura de `AudioRecord` sem zero-fill (carry entre leituras), `capture_ts` monotônico, PLC limitado com fade no PC, mute/volume do celular valendo de verdade (ganho remoto no ingest) e latência de rede instrumentada por software. O CI roda Rust, Node e Android em push e pull_request; a release sai de uma tag `v*.*.*` na `main`.

Em aberto: codec Opus (o wire format já reserva o campo, mas o pipeline usa PCM s16le) e a medição acústica (Método A) — o bipe de teste e o `scripts/onset-diff.py` estão prontos, mas a execução ainda é manual e exige hardware.

## Limitações conhecidas

- **Sem criptografia.** O áudio trafega em claro na LAN — quem estiver na mesma rede com sniffing consegue ouvir (`docs/arquitetura.md` §10).
- **Sem pareamento real.** Não existe código de 6 dígitos: o controle de acesso é a **allowlist de IP** — o áudio UDP só é aceito do IP que tem sessão de controle ativa.
- **Depende do cabo virtual** instalado no PC para que o sistema enxergue um microfone.
- **Isolamento de cliente** em AP corporativo/guest impede a descoberta e costuma bloquear o áudio. O celular não tem entrada de IP manual — se o beacon e o probe unicast não passarem, a rede precisa liberar broadcast.
- **Opus ainda não é implementado** — o wire format já reserva o codec, mas o pipeline usa PCM s16le.
- **Latência acústica (Método A) ainda não executada** — o número publicado é estimativa/instrumentação de software (`docs/latencia.md`); falta a medição com hardware.
