# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Micshare** — Turn a phone into a PC microphone over local Wi-Fi with < 150 ms latency, zero-config discovery, and mute/volume controls. The PC sees a normal microphone (via virtual cable), so it works in Discord, OBS, games, and meetings without plugins.

Architecture: `Phone (React Native) → UDP/Wi-Fi → PC (Rust + Tauri) → virtual cable → Discord/OBS/games`

## Repository Structure

```
Micshare/
├── docs/                          # Architecture, roadmap, sprint docs
│   ├── arquitetura.md            # Full architecture (protocol, jitter buffer, discovery, latency budget)
│   ├── roadmap.md                # 6 phases with verifiable gates (~6 weeks to MVP)
│   ├── sprint-01.md              # Sprint 1 plan (PoC audio) — completed, GO decision
│   ├── sprint-01-resultado.md    # Sprint 1 results & go/no-go evidence
│   └── latencia.md               # Latency measurement methodology (acoustic + software)
├── packages/
│   ├── protocol/                 # Shared binary protocol (header, encode/decode, validation, tests)
│   │   ├── src/{audioFrame.ts,ctrl.ts,constants.ts,index.ts}
│   │   └── dist/                 # Compiled output + tests
│   ├── pc/                       # Legacy PC server (Node.js/TypeScript) — CLI de controle (Fase 1)
│   │   ├── src/{index.ts,audioServer.ts,control.ts,discovery.ts,jitterBuffer.ts,sink.ts,metrics.ts,serverState.ts,fakeClient.ts}
│   │   ├── src/cli/{commands.ts,parse.ts,format.ts,repl.ts}   # registry único de comandos + REPL
│   │   └── dist/
│   └── pc-ui/                    # PC server UI (Rust + Tauri 3) — main binary
│       ├── src/                  # React 18 + TypeScript + Vite frontend
│       │   ├── components/       # ServerStatus, DeviceSelector, ControlsPanel, StatsPanel, LogConsole
│       │   ├── hooks/            # useServer for Tauri commands
│       │   └── types/            # TypeScript types
│       └── src-tauri/            # Rust backend
│           ├── src/
│           │   ├── audio/mod.rs      # JitterBuffer, AudioSink (cpal), AudioCapture
│           │   ├── control/mod.rs    # WebSocket control server
│           │   ├── discovery/mod.rs  # UDP beacon sender/listener
│           │   ├── protocol/mod.rs   # Binary protocol (AudioFrameHeader, CtrlMessage)
│           │   ├── server.rs         # MicshareServer orchestration
│           │   ├── commands.rs       # Tauri commands (start/stop, config, devices)
│           │   ├── lib.rs            # Library entry point
│           │   └── main.rs           # App entry point
│           ├── tauri.conf.json       # Tauri config (window, NSIS/MSI, store plugin)
│           └── Cargo.toml            # Rust dependencies
├── mobile/                       # React Native app (Expo, TypeScript)
│   ├── src/
│   │   ├── audio/audioCapture.ts # PCM capture via react-native-live-audio-stream
│   │   ├── transport/audioSender.ts # UDP sender
│   │   ├── control/controlClient.ts # WebSocket control client
│   │   ├── pairing/pairingClient.ts # Pairing handshake
│   │   └── index.ts
│   └── assets/
└── documenta_o_de_arquitetura_microfone_p2p.md  # Original briefing
```

## Key Technical Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| **PC Runtime** | Rust + Tauri 3 | Native binary, no runtime; cpal for audio I/O; single MSI/EXE installer |
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
npm run typecheck          # Type-check protocol + pc + mobile + pc-ui
npm --prefix packages/protocol run build             # Build protocol package
npm --prefix packages/protocol run test              # Run protocol tests
```

### PC Server UI (Tauri - packages/pc-ui)
```bash
npm --prefix packages/pc-ui run dev         # Dev mode (frontend + Rust backend)
npm --prefix packages/pc-ui run build       # Build frontend only
npm --prefix packages/pc-ui run tauri:dev   # Tauri dev (full app)
npm --prefix packages/pc-ui run tauri:build # Build native installer (MSI/NSIS)
cd packages/pc-ui/src-tauri && cargo run --release  # Run Rust backend directly
```

### Legacy PC Server (Node.js - packages/pc)
```bash
npm --prefix packages/pc run dev                    # sobe o servidor + prompt (micshare>)
npm --prefix packages/pc run dev -- devices         # List audio output devices
npm --prefix packages/pc run dev -- --device "CABLE" --verbose  # Run PC server
npm --prefix packages/pc run dev -- --no-repl       # servidor sem prompt
npm --prefix packages/pc run dev -- daemon start    # daemon desacoplado (Fase 2)
npm --prefix packages/pc run dev -- status --json   # consulta externa (exit 2 se parado)
npm --prefix packages/pc run dev -- ctl restart --sink
npm --prefix packages/pc run dev -- daemon stop
npm --prefix packages/pc run build                  # Build PC package
npm --prefix packages/pc run test                   # Run PC tests (tsx --test)
```

No prompt: `status`, `stats`, `clients`, `devices`, `device <substr>`, `mute`, `volume`,
`disconnect`, `restart`, `pair`, `beacon`, `help`, `stop`. Qualquer um aceita `--json`.
Plano completo: `docs/plano-cli.md`.

### Mobile (Expo)
```bash
npm --prefix mobile run start     # Start Expo dev server
npm --prefix mobile run typecheck # Type-check mobile
npm --prefix mobile run android   # Run on Android (requires dev client)
npm --prefix mobile run ios       # Run on iOS (requires dev client)
npm --prefix mobile run prebuild  # Prebuild native (required for audio capture)
```

### Key PC Server Flags (Tauri backend)
```
--port N                 # Audio UDP port (default 41235)
--control-port N         # WebSocket control port (default 41236)
--beacon-port N          # UDP beacon port (default 41234)
--device "substring"     # Match output device name (e.g., "CABLE")
--pairing-code CODE      # Override 6-digit pairing code
--verbose                # Print stats at 1 Hz
--list-devices           # List output devices and exit
--help                   # Show usage
```

### Environment Variables
```
MICSHARE_DROP_PCT=N      # Simulate N% packet loss on PC receiver (for testing)
```

## Development Workflow

1. **Type-check first**: `npm run typecheck` must pass (protocol + pc + mobile + pc-ui)
2. **Run tests**: `npm --prefix packages/protocol run test` and `npm --prefix packages/pc run test` and `cd packages/pc-ui/src-tauri && cargo test`
3. **PC Server (Tauri)**: Run with `npm --prefix packages/pc-ui run tauri:dev` or `cargo run --release -- --verbose` to see real-time stats (fps, loss%, buffer ms, gaps, underruns, fast-forwards)
4. **Mobile**: Requires physical device for audio capture (Expo Go doesn't support `react-native-live-audio-stream`; use dev client after `prebuild`)
5. **Fake client for PC testing**: `npx --prefix packages/pc tsx packages/pc/src/fakeClient.ts --hello --frames 500` (envia tom de 440 Hz e abre sessão WS; flags `--host/--port/--control-port/--drop/--codec/--token`)

## Important Implementation Details

### Protocol (`packages/protocol` & `packages/pc-ui/src-tauri/src/protocol`)
- Header: 16 bytes big-endian (magic, version, flags, seq u32, captureTs u32, payloadLen u16, channels, codec)
- Validation: strict on receiver side — magic, version, payloadLen bounds, channels=1, codec∈{0,1}
- Control messages: JSON over WebSocket, discriminated by `t` field

### Jitter Buffer (`packages/pc-ui/src-tauri/src/audio/mod.rs`)
- Ring buffer with logical `read_pos` (no shift on pop)
- Adaptive target frames (2–10) based on measured jitter
- PLC: zero-order hold with linear fade, max 3 frames
- Fast-forward: drop oldest frame when depth > target+3
- Flush: full reset when depth > 250 ms

### Audio Sink (`packages/pc-ui/src-tauri/src/audio/mod.rs`)
- Primary: cpal (WASAPI on Windows) with push-model stream callback
- Device selection by substring match (e.g., "CABLE" for VB-Cable)
- `write_silence()` writes zeroed frame on underrun
- No ffplay/naudiodon2 dependency

### Mobile Audio Capture (`mobile/src/audio/audioCapture.ts`)
- Uses `react-native-live-audio-stream` (Expo config plugin required)
- Accumulates base64 chunks into 10 ms frames (480 samples = 960 bytes)
- Emits `Int16Array` via `onFrame` callback

## Current Status (as of Sprint 1 completion)

- **Phase 0 (Foundation)**: ✅ Complete — docs, architecture, protocol, kanban board
- **Phase 1 (PoC Audio)**: ✅ GO — automated integration test passes (500 frames, 5% drop, 44 fps avg, 4.6% loss, 0 crashes)
- **Phase 2 (Zero Config)**: ✅ Complete — beacon discovery, pairing handshake, mobile app UI
- **Phase 5 (PC UI - Tauri)**: ✅ Complete — Rust + Tauri 3 native binary with MSI/NSIS installers
- **Latency estimate (Method B)**: 55–95 ms (without virtual cable); acoustic Method A pending
- **Next**: Phase 3 (Voice Quality) — AEC/AGC/NS, Opus codec, mobile microphone source selector

## Testing Notes

- Protocol tests: 23 tests covering encode/decode, validation, flags (Node.js + Rust)
- PC tests (legacy): jitter buffer (unit), integration (fake client → server)
- PC tests (Tauri): `cd packages/pc-ui/src-tauri && cargo test` — jitter buffer, audio sink, control, discovery, server integration
- Run single test: `node --test packages/pc/dist/jitterBuffer.test.js` or `cargo test jitter -- --nocapture`
- Mobile cannot be tested in Expo Go — requires dev client on physical device
- Tauri dev: `npm --prefix packages/pc-ui run tauri:dev` — full app with hot reload

## Known Limitations / Tech Debt

1. **Legacy Node.js server** — `packages/pc` is deprecated; all new development targets `packages/pc-ui` (Rust/Tauri)
2. **Opus codec not yet implemented** — PCM only; Opus decoder stub exists in `packages/pc-ui/src-tauri/src/opus.rs`
3. **No encryption** — audio is plaintext on LAN. Documented in README.
4. **Client isolation** — AP isolation (corporate/guest Wi-Fi) blocks discovery and often audio. Manual IP fallback required.
5. **Acoustic latency measurement (Method A)** not yet executed — pending hardware test.
6. **App icons** — placeholder icons used; need proper branding assets.

## References

- Full architecture: `docs/arquitetura.md`
- Roadmap & gates: `docs/roadmap.md`
- Sprint 1 plan: `docs/sprint-01.md`
- Sprint 1 results: `docs/sprint-01-resultado.md`
- CLI plan: `docs/plano-cli.md`
- Latency methodology: `docs/latencia.md`
- Original briefing: `documenta_o_de_arquitetura_microfone_p2p.md`