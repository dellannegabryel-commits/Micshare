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
│   ├── roadmap.md                # 6 phases with verifiable gates (~6 weeks to MVP)
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
│       │   ├── audio/mod.rs      # JitterBuffer, AudioSink (cpal), AudioCapture
│       │   ├── control/mod.rs    # WebSocket control server
│       │   ├── discovery/mod.rs  # UDP beacon sender/listener
│       │   ├── protocol/mod.rs   # Binary protocol (AudioFrameHeader, CtrlMessage)
│       │   ├── server.rs         # MicshareServer orchestration
│       │   ├── commands.rs       # Tauri commands (start/stop, config, devices)
│       │   ├── lib.rs            # Library entry point
│       │   └── main.rs           # App entry point
│       ├── examples/             # serve, devices, hot_swap, discovery_probe
│       ├── tauri.conf.json       # Tauri config (window, NSIS/MSI, store plugin)
│       └── Cargo.toml            # Rust dependencies
├── mobile/                       # Android app (Kotlin + Jetpack Compose)
│   └── app/src/main/java/com/micshare/
│       ├── audio/                # AudioRecord + AudioCaptureService (foreground)
│       ├── network/              # AudioSender (UDP), ControlClient (WS), BeaconListener
│       ├── protocol/             # header e mensagens de controle (espelho do Rust)
│       ├── ui/                   # Compose: MainScreen, DiscoverySection, SessionSection
│       └── viewmodel/            # MainViewModel (descoberta → sessão → streaming)
├── protocol/                     # Shared binary protocol (header, encode/decode, validation, tests)
│   ├── src/{audioFrame.ts,ctrl.ts,constants.ts,index.ts}
│   └── dist/                     # Compiled output + tests (gitignored)
├── assets/
│   └── icon-source.png           # Master artwork (1024x1024) for the app icons
└── scripts/
    ├── set-version.mjs           # Single source of truth for the release version
    ├── generate-icons.py         # Renders Tauri + Android icons from the master
    └── install-vbcable.ps1       # Installs the virtual cable driver (Windows)
```

## Key Technical Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| **PC Runtime** | Rust + Tauri 2 | Native binary, no runtime; cpal for audio I/O; single MSI/EXE installer |
| **Audio Protocol** | PCM s16le 48kHz mono, 10 ms frames (960 B payload) | Fits in single IP packet (MTU 1500); zero native deps on mobile |
| **Jitter Buffer** | Adaptive (2–10 frames), PLC zero-order, fast-forward, flush | Transforms Wi-Fi jitter to stable audio; testable with injected clock |
| **Transport** | 3 independent channels: UDP broadcast (discovery), WS (control), UDP unicast (audio) | Each with guarantee matching its need |
| **Discovery** | PC broadcasts beacon (1 Hz) → phone listens | PC has stable IP; avoids mDNS native deps on React Native |
| **Pairing** | 6-digit code rotated per server boot, sent in `hello` | Low-friction, valid per session |
| **Audio Output** | cpal (WASAPI on Windows) → VB-Cable | Native push-model audio sink; direct device selection |
| **Security (MVP)** | No encryption; 6-digit pairing; strict packet validation | LAN threat model; WebRTC/SRTP deferred to Phase 5 if needed |

## Common Commands

### Root (monorepo)
```bash
npm run typecheck          # Type-check protocol + pc
npm --prefix protocol run build             # Build protocol package
npm --prefix protocol run test              # Run protocol tests
node scripts/set-version.mjs 0.4.0         # Bump the version in every manifest
node scripts/set-version.mjs --check 0.4.0 # Verify version consistency
```

### PC Server UI (Tauri - pc)
```bash
npm --prefix pc run dev         # Dev mode (frontend + Rust backend)
npm --prefix pc run build       # Build frontend only
npm --prefix pc run tauri:dev   # Tauri dev (full app)
npm --prefix pc run tauri:build # Build native installer (MSI + NSIS)
cd pc/src-tauri && cargo test   # Run Rust backend tests
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

1. **Type-check first**: `npm run typecheck` must pass (protocol + pc)
2. **Run tests**: `npm --prefix protocol run test` and `cd pc/src-tauri && cargo test`
3. **PC Server (Tauri)**: Run with `npm --prefix pc run tauri:dev`; the server auto-starts with the app
4. **Mobile**: Requires physical device for audio capture (foreground service + `AudioRecord`)
5. **Diagnostics**: `cd pc/src-tauri && cargo run --example serve|devices|hot_swap|discovery_probe`

## Important Implementation Details

### Protocol (`protocol` & `pc/src-tauri/src/protocol`)
- Header: 16 bytes big-endian (magic, version, flags, seq u32, captureTs u32, payloadLen u16, channels, codec)
- Validation: strict on receiver side — magic, version, payloadLen bounds, channels=1, codec∈{0,1}
- Control messages: JSON over WebSocket, discriminated by `t` field

### Jitter Buffer (`pc/src-tauri/src/audio/mod.rs`)
- Ring buffer with logical `read_pos` (no shift on pop)
- Adaptive target frames (2–10) based on measured jitter
- PLC: zero-order hold with linear fade, max 3 frames
- Fast-forward: drop oldest frame when depth > target+3
- Flush: full reset when depth > 250 ms

### Audio Sink (`pc/src-tauri/src/audio/mod.rs`)
- Primary: cpal (WASAPI on Windows) with push-model stream callback
- Device selection by substring match (e.g., "CABLE" for VB-Cable)
- `write_silence()` writes zeroed frame on underrun
- No ffplay/naudiodon2 dependency

### Mobile Audio Capture (`mobile/app/src/main/java/com/micshare/audio/AudioCapture.kt`)
- Uses `AudioRecord` in a foreground service (`AudioCaptureService`)
- Accumulates samples into 10 ms frames (480 samples = 960 bytes at 48 kHz)
- Sends each frame as one UDP datagram to the PC

## Current Status (as of Sprint 1 completion)

- **Phase 0 (Foundation)**: ✅ Complete — docs, architecture, protocol, kanban board
- **Phase 1 (PoC Audio)**: ✅ GO — automated integration test passes (500 frames, 5% drop, 44 fps avg, 4.6% loss, 0 crashes)
- **Phase 2 (Zero Config)**: ✅ Complete — beacon discovery, pairing handshake, mobile app UI
- **Phase 5 (PC UI - Tauri)**: ✅ Complete — Rust + Tauri 3 native binary with MSI/NSIS installers
- **Latency estimate (Method B)**: 55–95 ms (without virtual cable); acoustic Method A pending
- **Next**: Phase 3 (Voice Quality) — AEC/AGC/NS, Opus codec, mobile microphone source selector

## Testing Notes

- Protocol tests: 23 tests covering encode/decode, validation, flags (Node.js + Rust)
- PC tests (Tauri): `cd pc/src-tauri && cargo test` — jitter buffer, audio sink, control, discovery, server integration
- Run single test: `node --test protocol/dist/audioFrame.test.js` or `cargo test jitter -- --nocapture`
- Mobile requires a physical device (foreground service + `AudioRecord`)
- Tauri dev: `npm --prefix pc run tauri:dev` — full app with hot reload

## Known Limitations / Tech Debt

1. **Opus codec not yet implemented** — PCM only; the wire format reserves the codec field
2. **No encryption** — audio is plaintext on LAN. Documented in README.
3. **Client isolation** — AP isolation (corporate/guest Wi-Fi) blocks discovery and often audio.
4. **Acoustic latency measurement (Method A)** not yet executed — pending hardware test.
5. **App icons** — placeholder icons used; need proper branding assets.

## References

- Full architecture: `docs/arquitetura.md`
- Roadmap & gates: `docs/roadmap.md`
- Sprint 1 results: `docs/sprint-01-resultado.md`
- Latency methodology: `docs/latencia.md`
- Original briefing: `docs/documenta_o_de_arquitetura_microfone_p2p.md`