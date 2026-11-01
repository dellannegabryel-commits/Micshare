# Micshare

**O celular vira o microfone do PC pela rede local**, com baixa latência e sem
cabo. O áudio do celular chega ao PC e é injetado num cabo de áudio virtual,
aparecendo como microfone no Discord, OBS, Zoom e jogos.

```
Celular (Android)  ──UDP 41235──▶  Servidor PC (Rust + Tauri 2)  ──cpal──▶  CABLE Input  ──▶  CABLE Output  ──▶  Discord / OBS / Zoom
                          ▲                                                                       (microfone)
                          └── controle WS 41236 (hello/welcome/stats) ──┘
                     beacon UDP 41234 (descoberta)
```

Servidor PC em **Rust + Tauri 2**, app Android em **Kotlin + Jetpack Compose**.

---

## 📥 Download

| Versão | Arquivo | Plataforma |
|---|---|---|
| [`v0.3.0`](https://github.com/dellannegabryel-commits/Micshare/releases/tag/v0.3.0) | `micshare-pc.exe` | Windows 10/11 x64 |
| [`v0.3.0`](https://github.com/dellannegabryel-commits/Micshare/releases/tag/v0.3.0) | `Micshare_0.3.0_x64-setup.exe` | Windows (instalador) |
| [`v0.3.0`](https://github.com/dellannegabryel-commits/Micshare/releases/tag/v0.3.0) | `app-debug.apk` | Android 6.0+ (API 23) |

### 🔌 VB-Cable — obrigatório para usar como microfone

O Micshare entrega o áudio no **cabo virtual**. Sem ele, não existe como
transformar o celular em microfone.

**➜ Download direto (Windows): https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip**

Página oficial e instruções: **https://vb-audio.com/Cable/**

> Extraia o ZIP e execute o instalador **como administrador**.
> **Reinicie o Windows** após instalar.
> O VB-Cable é *donationware*: a instalação é gratuita, a VB-Audio aceita doações.

Alternativas: **PipeWire** (Linux), **BlackHole** (macOS), **VoiceMeeter** (Windows).

---

## 🚀 Como usar

1. **Instale o VB-Cable** (link acima) e reinicie o Windows.
2. **Execute o `micshare-pc.exe`** — o servidor sobe automaticamente (auto-start),
   com o cabo virtual já selecionado.
3. **Instale o `app-debug.apk`** no celular (permita instalar de fontes
   desconhecidas) e abra o Micshare.
4. No Discord/OBS/Zoom, selecione **CABLE Output** como microfone.
5. Conecte e fale — o PC passa a ouvir o celular.

### Por que "CABLE Input" e "CABLE Output"?

O VB-Cable é um par de endpoints: o áudio que entra no **CABLE Input** (lado de
playback, onde o Micshare escreve) é encaminhado para o **CABLE Output** (lado de
recording, que os apps capturam como microfone).

```
Micshare ──escreve──▶ CABLE Input ═══(cabo virtual)═══▶ CABLE Output ──▶ app captura como mic
```

O Micshare detecta o cabo automaticamente e o **prefere ao dispositivo padrão do
sistema** — sem isso o áudio iria para os alto-falantes/fones, e não viraria
microfone.

---

## ✨ Funcionalidades

### Servidor PC (Rust + Tauri 2)

- **Painel de controle funcional** — mute e volume do PC aplicados no callback
  de tempo real do `cpal` (ganho por amostra, fixed-point `0..=4000`, com
  saturação em i16). Estado refletido ao vivo nas estatísticas.
- **Hot-swap do dispositivo de saída** — troca o stream sem reiniciar o
  servidor, de forma transacional: constrói o novo stream pausado → derruba o
  antigo (aguardando o drop real, que libera o endpoint no WASAPI) → inicia o
  novo. **Rollback** se falhar, para o áudio nunca ficar mudo.
- **Seleção inteligente de dispositivo** — nome exato > prefixo > substring, com
  desempate estável; detecta `CABLE Input` / `VB-Audio` / `VoiceMeeter`.
- **Descoberta por beacon** — o celular encontra o PC automaticamente na LAN.
- **Estatísticas ao vivo** — FPS, perda, profundidade do jitter buffer, gaps,
  underruns, reconexões, sessões conectadas.
- **Shutdown determinístico** — parar e iniciar de novo não gera `portInUse`.
- **Erros estruturados** — `{ code, message }` com códigos estáveis
  (`portInUse`, `audioDeviceError`, `serverNotRunning`, …).
- **Auto-start** — o servidor sobe junto com o app.

### App Android (Kotlin + Compose)

- Captura de áudio real (PCM 48 kHz / mono) e envio por UDP.
- Handshake `hello` → `welcome` com o protocolo canônico JSON.
- Mute e volume enviados ao PC pelo canal de controle.
- Descoberta do PC na LAN e serviço de captura em foreground com notificação.

---

## 🧱 Protocolo

Protocolo canônico único PC↔celular, em JSON (controle) e datagramas UDP
(audio). Detalhes em [`docs/arquitetura.md`](docs/arquitetura.md).

| Porta | Transporte | Função |
|---|---|---|
| `41234` | UDP | beacon de descoberta (`Beacon`) |
| `41235` | UDP | frames de áudio do celular |
| `41236` | WebSocket | controle: `hello`/`welcome`/`stats`/`mute`/`volume`/`bye`/`error` |

**Header de áudio** — 16 bytes Big-Endian, magic `0x4D53`, seguido de PCM
`s16le` little-endian:

```
┌──────────┬───────────┬───────────┬──────────┬──────────┬───────────┐
│ magic    │ seq       │ capture_ts│ length   │ codec    │ channels  │
│ u16      │ u32       │ u32       │ u16      │ u8       │ u8        │
└──────────┴───────────┴───────────┴──────────┴──────────┴───────────┘
```

---

## 🛠️ Desenvolvimento

Pré-requisitos: **Rust 1.85+**, **Node 20+**, **JDK 21**, **Android SDK 35**.

### Servidor PC

```bash
cd packages/pc-ui

npm install
npm run tauri:dev        # app em modo dev (auto-start do servidor)
npm run tauri:build      # build de release: .exe + instaladores NSIS/MSI

# testes e lint do backend Rust
cd src-tauri
cargo test
cargo clippy --all-targets
cargo fmt --all

# diagnósticos
cargo run --example devices   # lista dispositivos de saída e seus formatos
cargo run --example hot_swap   # testa o hot-swap e o rollback
cargo run --example serve      # servidor sem UI
```

### App Android

```bash
cd mobile-android
gradle assembleDebug        # mobile-android/app/build/outputs/apk/debug/app-debug.apk
gradle installDebug         # instala no dispositivo conectado
```

> Sem `gradlew.bat` no repositório: use o Gradle do sistema ou o distribution
> em `~/.gradle/wrapper/dists/gradle-8.13-all/`.

---

## 📁 Estrutura

```
packages/pc-ui/           Servidor PC — Tauri 2 + React + TypeScript
  src-tauri/src/
    audio/                Pipeline: jitter buffer, reamostragem, sink cpal
    control/              Servidor WebSocket (sessões, mute/volume do celular)
    discovery/            Beacon UDP
    protocol/             Protocolo canônico (JSON + header de áudio)
    commands.rs           Comandos Tauri expostos à UI
    server.rs             Orquestra os 3 subsistemas + ServerStats
    state.rs              Estado compartilhado (Tauri State)
mobile-android/           App Android — Kotlin + Compose
docs/                     Arquitetura, roadmap, latência, planos
```

---

## 📚 Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/arquitetura.md`](docs/arquitetura.md) | protocolo de áudio, jitter buffer, controle WebSocket, descoberta, roteamento VB-Cable/PipeWire/BlackHole, orçamento de latência |
| [`docs/plano-correcoes-painel-controle.md`](docs/plano-correcoes-painel-controle.md) | plano executado do painel funcional, hot-swap e direcionamento a microfone (fases 1–6) |
| [`docs/latencia.md`](docs/latencia.md) | orçamento de latência por etapa e medições |
| [`docs/roadmap.md`](docs/roadmap.md) | fases do projeto com gates verificáveis |
| [`docs/sprint-01.md`](docs/sprint-01.md) | sprint do PoC de áudio, DoD e checklist de teste |

---

## ⚠️ Limitações conhecidas

- **Sem criptografia** — o áudio trafega em claro na LAN (ver
  [`docs/arquitetura.md`](docs/arquitetura.md) §10).
- **Depende de cabo virtual** — sem VB-Cable/PipeWire/BlackHole o sistema não
  enxerga um microfone.
- **Isolamento de cliente** — redes Wi-Fi de guest/AP corporativo bloqueiam a
  descoberta e às vezes o áudio.
- **Android**: o mute do celular sinaliza a flag, mas não interrompe a
  captura; mute/volume não ressincronizam ao reconectar.
- O APK publicado é de **debug** (sem assinatura de release).

---

## 📄 Licença

Uso pessoal. O VB-Cable é *donationware* da VB-Audio — veja
<https://vb-audio.com/Cable/>.
