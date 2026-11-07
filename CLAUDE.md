# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Micshare** — Turn a phone into a PC microphone over local Wi-Fi with < 150 ms latency, zero-config discovery, and mute/volume controls. The PC sees a normal microphone (via virtual cable), so it works in Discord, OBS, games, and meetings without plugins.

Architecture: `Phone (Android/Kotlin) → UDP/Wi-Fi → PC (Rust + Tauri 2) → virtual cable → Discord/OBS/games`

## Repository Structure

```
Micshare/
├── docs/                          # Architecture, roadmap, sprint docs
│   ├── arquitetura.md            # Full architecture (protocol, jitter buffer, discovery, latency budget)
│   ├── roadmap.md                # Phases with verifiable gates (~6 weeks to MVP)
│   ├── sprint-01-resultado.md    # Sprint 1 results & go/no-go evidence
│   ├── latencia.md               # Latency measurement methodology (acoustic + software)
│   └── documenta_o_de_arquitetura_microfone_p2p.md  # Original briefing
├── pc/                           # PC server UI (Rust + Tauri 2) — main binary
│   ├── src/                      # React 18 + TypeScript + Vite frontend
│   │   ├── components/           # ServerStatus, DeviceSelector, ControlsPanel, StatsPanel, LogConsole
│   │   ├── hooks/                # useServer for Tauri commands
│   │   └── types/                # TypeScript types
│   └── src-tauri/                # Rust backend
│       ├── src/
│       │   ├── audio/            # jitter.rs (BTreeMap buffer + PLC/fade), sink.rs (cpal),
│       │   │                      # latency.rs (network latency), resample.rs, mod.rs (pipeline)
│       │   ├── control/mod.rs    # WebSocket control server
│       │   ├── discovery/mod.rs  # UDP beacon sender/listener
│       │   ├── protocol/         # mod.rs, audio.rs, ctrl.rs — binary protocol + control messages
│       │   ├── server.rs         # MicshareServer orchestration
│       │   ├── commands.rs       # Tauri commands (start/stop, config, devices)
│       │   ├── lib.rs            # Library entry point
│       │   └── main.rs           # App entry point
│       ├── examples/             # serve, devices, hot_swap, discovery_probe, lossy_client
│       ├── tauri.conf.json       # Tauri config (window, NSIS/MSI, store plugin)
│       └── Cargo.toml            # Rust dependencies
├── mobile/                       # Android app (Kotlin + Jetpack Compose)
│   └── app/src/main/java/com/micshare/
│       ├── audio/                # AudioCapture, AudioCaptureService (foreground), AudioEffects (AEC/NS),
│       │                          # AudioSourcePlan, CaptureClock, CaptureConfig, FrameAssembler,
│       │                          # MicDevices, StatusThrottle, StreamingStatus, TestTone, WakeLockPolicy
│       ├── network/              # AudioSender (UDP), ControlClient (WS), BeaconListener
│       ├── protocol/             # header e mensagens de controle (espelho do Rust)
│       ├── ui/                   # Compose: MainScreen, DiscoverySection, SessionSection, AudioInputSection
│       └── viewmodel/            # MainViewModel (descoberta → sessão → streaming)
├── assets/
│   └── icon-source.png           # Master artwork (1024x1024) for the app icons
└── scripts/
    ├── set-version.mjs           # Single source of truth for the release version
    ├── generate-icons.py         # Renders Tauri + Android icons from the master
    ├── install-vbcable.ps1       # Installs the virtual cable driver (Windows)
    └── onset-diff.py             # Acoustic latency: compares test-beep onsets between two tracks
```

## Key Technical Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| **PC Runtime** | Rust + Tauri 2 | Native binary, no runtime; cpal for audio I/O; single MSI/EXE installer |
| **Audio Protocol** | PCM s16le 48kHz mono, 10 ms frames (960 B payload) | Fits in single IP packet (MTU 1500); zero native deps on mobile |
| **Jitter Buffer** | `BTreeMap` keyed by absolute `seq`; adaptive target from p95 of `capture_ts` deltas (2–8 frames); PLC limited to 3 frames with linear fade | Transforms Wi-Fi jitter to stable audio; the fade removes the audible click on a lost packet |
| **Transport** | 3 independent channels: UDP broadcast (discovery), WS (control), UDP unicast (audio) | Each with guarantee matching its need |
| **Discovery** | PC broadcasts beacon (1 Hz) → phone listens | PC has stable IP; avoids mDNS native deps on the Android client |
| **Pairing / Access** | No 6-digit code — UDP audio is accepted only from IPs with an active control session (IP allowlist) | No shared secret to type; the session itself is the credential |
| **Audio Output** | cpal (WASAPI on Windows) → VB-Cable | Native push-model audio sink; direct device selection |
| **Remote Gain** | Phone mute/volume applied on the PC at ingest (`RemoteGain`); `welcome` carries `muted`/`volume` back | The PC is the single mixer point, so the slider survives reconnects |
| **Mobile Voice Quality** | AEC/NS via `android.media.audiofx` when the source is `MIC`; `VOICE_COMMUNICATION` relies on the HAL (app applies nothing); `UNPROCESSED` stays raw | Avoids double processing and keeps the source honest |
| **Security (MVP)** | No encryption; IP allowlist for audio; strict packet validation | LAN threat model; WebRTC/SRTP deferred to a later phase if needed |

## Requirements

- Node **24+** (what CI uses), Rust **1.85+** (edition 2024), JDK **21**, Android SDK 35

## Common Commands

### Root (monorepo)
```bash
npm run typecheck          # Type-check pc
node scripts/set-version.mjs 0.5.0         # Bump the version in every manifest
node scripts/set-version.mjs --check 0.5.0 # Verify version consistency
```

### PC Server UI (Tauri - pc)
```bash
npm --prefix pc run dev         # Dev mode (frontend + Rust backend)
npm --prefix pc run build       # Build frontend only
npm --prefix pc run tauri:dev   # Tauri dev (full app)
npm --prefix pc run tauri:build # Build native installer (MSI + NSIS)
cd pc/src-tauri && cargo test   # Run Rust backend tests
cd pc/src-tauri && cargo run --example lossy_client -- --drop-pct 20 --jitter-ms 30 --count 200  # Simulate a bad network (validates PLC/fade)
```

### Mobile (Android - Kotlin + Compose)
```bash
cd mobile
./gradlew :app:assembleDebug    # APK de debug
./gradlew :app:installDebug     # instala no dispositivo conectado
./gradlew :app:assembleRelease  # APK de release (assinado)
./gradlew :app:test             # testes unitários
```

## Development Workflow

1. **Type-check first**: `npm run typecheck` must pass (pc)
2. **Run tests**: `cd pc/src-tauri && cargo test` and `cd mobile && ./gradlew :app:test`
3. **PC Server (Tauri)**: Run with `npm --prefix pc run tauri:dev`; the server auto-starts with the app
4. **Mobile**: Requires physical device for audio capture (foreground service + `AudioRecord`)
5. **Diagnostics**: `cd pc/src-tauri && cargo run --example serve|devices|hot_swap|discovery_probe|lossy_client`

## Important Implementation Details

### Protocol (`pc/src-tauri/src/protocol`)
- Header: 16 bytes big-endian (magic, version, flags, seq u32, captureTs u32, payloadLen u16, channels, codec)
- Validation: strict on receiver side — magic, version, payloadLen bounds, channels=1, codec∈{0,1}
- Control messages: JSON over WebSocket, discriminated by `t` field
- The TypeScript reference package was removed; the Rust implementation is the only one

### Jitter Buffer (`pc/src-tauri/src/audio/jitter.rs`)
- `BTreeMap` keyed by absolute `seq` (u32 wrap is unwrapped into a u64 counter) — no shift on pop
- Adaptive target frames (2–8) from the **p95** of the `capture_ts` deltas over a 100-frame window; deltas above 4× `frame_ms` are dropped as outliers
- PLC: silence with linear fade, max 3 frames (30 ms) — fade-out 1→0 on the held tail, fade-in 0→1 on the resumed frame (`FADE = 64` samples)
- Fast-forward: drop oldest frame when depth > target+3
- Flush: full reset when depth > 250 ms

### Audio Sink (`pc/src-tauri/src/audio/sink.rs`)
- Primary: cpal (WASAPI on Windows) with push-model stream callback
- Device selection by substring match (e.g., "CABLE" for VB-Cable)
- `write_silence()` writes zeroed frame on underrun
- No ffplay/naudiodon2 dependency

### Network Latency (`pc/src-tauri/src/audio/latency.rs`)
- The phone measures RTT with `ping`/`pong` and publishes the clock offset (`t1 - t0 - rtt/2`)
- The PC tracks `capture → arrival` per frame and publishes median and p95 in `stats` (`latencyMs`, `latencyP95Ms`)
- No offset published yet → latency measurement is skipped

### Mobile Audio Capture (`mobile/app/src/main/java/com/micshare/audio/`)
- `AudioCapture` uses `AudioRecord.Builder`; the buffer is sized from `AudioRecord.getMinBufferSize(...)`
- Partial reads become carry (`FrameAssembler`) — never zero-fill, which would inject a click
- `CaptureClock` uses `SystemClock.elapsedRealtime()` (monotonic, not wall clock); `capture_ts` is the low 32 bits
- Runs in a foreground service (`AudioCaptureService`); status is published at 2 Hz (`StatusThrottle`)
- AEC/NS come from `android.media.audiofx` (`AudioEffects`); `AudioSourcePlan` picks them per source: `MIC` applies the available effects, `VOICE_COMMUNICATION` applies none (the HAL already processes), `UNPROCESSED` stays raw
- `MicDevices` lists input devices (`getDevices(GET_DEVICES_INPUTS)`) and applies `record.setPreferredDevice`
- `TestTone` plays the 1 kHz beep used by the acoustic measurement (`scripts/onset-diff.py`)

## Current Status (v0.5.0)

- **Phase 0 (Foundation)**: ✅ Complete — docs, architecture, protocol, kanban board
- **Phase 1 (PoC Audio)**: ✅ GO — automated integration test passes (500 frames, 5% drop, 44 fps avg, 4.6% loss, 0 crashes)
- **Phase 2 (Zero Config)**: ✅ Complete — beacon discovery, session handshake, mobile app UI
- **Phase 6 (Voice Quality)**: ✅ Complete in v0.5.0 — AEC/NS on the `MIC` source, mobile microphone selector, no-zero-fill `AudioRecord` reads, monotonic `capture_ts`
- **Phase 5 (PC UI - Tauri)**: ✅ Complete — Rust + Tauri 2 native binary with MSI/NSIS installers
- **Jitter buffer**: PLC limited to 3 frames with linear fade — a lost packet no longer clicks; adaptive target from the p95 of `capture_ts` deltas
- **Latency**: instrumented by software (`latencyMs`, `latencyP95Ms` in `stats`); acoustic Method A still needs a manual run with hardware (`TestTone` + `scripts/onset-diff.py`)
- **CI**: `.github/workflows/ci.yml` runs Rust (fmt/clippy/test), Node (typecheck) and Android (unit tests) on push and pull_request; `.github/workflows/release.yml` publishes from a `v*.*.*` tag on `main`
- **Next**: Opus codec and the remaining polish (tray icon, auto-start, code signing)

## Testing Notes

- PC tests (Tauri): `cd pc/src-tauri && cargo test` — jitter buffer, audio sink, latency tracker, protocol, control, discovery, server integration
- Run single test: `cargo test jitter -- --nocapture`
- Network simulation: `cd pc/src-tauri && cargo run --example lossy_client -- --drop-pct 20 --jitter-ms 30 --count 200` (validates PLC/fade)
- Mobile tests: `cd mobile && ./gradlew :app:test` — unit tests only
- Mobile requires a physical device for capture (foreground service + `AudioRecord`)
- Tauri dev: `npm --prefix pc run tauri:dev` — full app with hot reload

## Known Limitations / Tech Debt

1. **Opus codec not yet implemented** — PCM only; the wire format reserves the codec field
2. **No encryption** — audio is plaintext on LAN. Documented in README.
3. **No real pairing** — the control is an IP allowlist (only IPs with an active control session may send UDP audio); there is no 6-digit code
4. **Client isolation** — AP isolation (corporate/guest Wi-Fi) blocks discovery and often audio.
5. **Acoustic latency measurement (Method A)** not yet executed — the beep and `scripts/onset-diff.py` are ready, but a human still has to run them with hardware.
6. **App icons** — placeholder icons used; need proper branding assets.

## References

- Full architecture: `docs/arquitetura.md`
- Roadmap & gates: `docs/roadmap.md`
- Sprint 1 results: `docs/sprint-01-resultado.md`
- Latency methodology: `docs/latencia.md`
- Original briefing: `docs/documenta_o_de_arquitetura_microfone_p2p.md`