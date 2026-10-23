# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Micshare** — Turn a phone into a PC microphone over local Wi-Fi with < 150 ms latency, zero-config discovery, and mute/volume controls. The PC sees a normal microphone (via virtual cable), so it works in Discord, OBS, games, and meetings without plugins.

Architecture: `Phone (React Native) → UDP/Wi-Fi → PC (Node + TypeScript) → virtual cable → Discord/OBS/games`

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
│   └── pc/                       # PC server: beacon, WS, UDP, jitter buffer, audio sink
│       ├── src/{index.ts,audioServer.ts,control.ts,discovery.ts,jitterBuffer.ts,sink.ts,metrics.ts,fakeClient.ts}
│       └── dist/
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
| **PC Runtime** | Node 24 + TypeScript | Fast iteration; PCM/Opus CPU trivial; only native is PortAudio via `naudiodon2` |
| **Audio Protocol** | PCM s16le 48kHz mono, 10 ms frames (960 B payload) | Fits in single IP packet (MTU 1500); zero native deps on mobile |
| **Jitter Buffer** | Adaptive (2–8 frames), PLC zero-order, fast-forward, flush | Transforms Wi-Fi jitter to stable audio; testable with injected clock |
| **Transport** | 3 independent channels: UDP broadcast (discovery), WS (control), UDP unicast (audio) | Each with guarantee matching its need |
| **Discovery** | PC broadcasts beacon (1 Hz) → phone listens | PC has stable IP; avoids mDNS native deps on React Native |
| **Pairing** | 6-digit code rotated per server boot, sent in `hello` | Low-friction, valid per session |
| **Audio Output** | ffplay fallback (PCM pipe); `naudiodon2` available but pull-model | `naudiodon2` doesn't expose push stream easily; ffplay works reliably |
| **Security (MVP)** | No encryption; 6-digit pairing; strict packet validation | LAN threat model; WebRTC/SRTP deferred to Phase 5 if needed |

## Common Commands

### Root (monorepo)
```bash
npm run typecheck          # Type-check protocol + pc + mobile
npm --prefix packages/pc run dev -- --list-devices   # List audio output devices
npm --prefix packages/pc run dev -- --device "CABLE" --verbose  # Run PC server (select device, verbose stats)
npm --prefix packages/pc run dev -- --sink=ffplay    # Force ffplay sink
npm --prefix packages/pc run build                   # Build PC package
npm --prefix packages/protocol run build             # Build protocol package
npm --prefix packages/protocol run test              # Run protocol tests
npm --prefix packages/pc run test                    # Run PC tests (node --test)
```

### Mobile (Expo)
```bash
npm --prefix mobile run start     # Start Expo dev server
npm --prefix mobile run typecheck # Type-check mobile
npm --prefix mobile run android   # Run on Android (requires dev client)
npm --prefix mobile run ios       # Run on iOS (requires dev client)
npm --prefix mobile run prebuild  # Prebuild native (required for audio capture)
```

### Key PC Server Flags
```
--port N                 # Audio UDP port (default 41235)
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

1. **Type-check first**: `npm run typecheck` must pass
2. **Run tests**: `npm --prefix packages/protocol run test` and `npm --prefix packages/pc run test`
3. **PC Server**: Run with `--verbose` to see real-time stats (fps, loss%, buffer ms, gaps, underruns, fast-forwards)
4. **Mobile**: Requires physical device for audio capture (Expo Go doesn't support `react-native-live-audio-stream`; use dev client after `prebuild`)
5. **Fake client for PC testing**: `node packages/pc/dist/fakeClient.js` (sends synthetic frames)

## Important Implementation Details

### Protocol (`packages/protocol`)
- Header: 16 bytes big-endian (magic, version, flags, seq u32, captureTs u32, payloadLen u16, channels, codec)
- Validation: strict on receiver side — magic, version, payloadLen bounds, channels=1, codec∈{0,1}
- Control messages: JSON over WebSocket, discriminated by `t` field

### Jitter Buffer (`packages/pc/src/jitterBuffer.ts`)
- Ring buffer with logical `readPos` (no shift on pop)
- Adaptive target frames (2–8) based on measured jitter
- PLC: zero-order hold with linear fade, max 3 frames
- Fast-forward: drop oldest frame when depth > target+3
- Flush: full reset when depth > 250 ms

### Audio Sink (`packages/pc/src/sink.ts`)
- Primary: ffplay via stdin (PCM s16le 48k mono)
- Fallback: `naudiodon2` (PortAudio) — currently not used due to pull-model mismatch
- `writeSilence()` writes zeroed frame on underrun

### Mobile Audio Capture (`mobile/src/audio/audioCapture.ts`)
- Uses `react-native-live-audio-stream` (Expo config plugin required)
- Accumulates base64 chunks into 10 ms frames (480 samples = 960 bytes)
- Emits `Int16Array` via `onFrame` callback

## Current Status (as of Sprint 1 completion)

- **Phase 0 (Foundation)**: ✅ Complete — docs, architecture, protocol, kanban board
- **Phase 1 (PoC Audio)**: ✅ GO — automated integration test passes (500 frames, 5% drop, 44 fps avg, 4.6% loss, 0 crashes)
- **Latency estimate (Method B)**: 55–95 ms (without virtual cable); acoustic Method A pending
- **Next**: Phase 2 (Zero Config) — beacon discovery, pairing, mobile app UI

## Testing Notes

- Protocol tests: 23 tests covering encode/decode, validation, flags
- PC tests: jitter buffer (unit), integration (fake client → server)
- Run single test: `node --test packages/pc/dist/jitterBuffer.test.js`
- Mobile cannot be tested in Expo Go — requires dev client on physical device

## Known Limitations / Tech Debt

1. **`naudiodon2` pull-model** — doesn't expose push stream; can't easily select CABLE device. ffplay fallback works but doesn't integrate with Windows audio routing (Discord won't see it). Need native addon wrapper or alternative for Phase 4.
2. **Mobile spike incomplete** — `react-native-audio-api` needs Expo dev client + physical device. Not yet validated end-to-end.
3. **No encryption** — audio is plaintext on LAN. Documented in README.
4. **Client isolation** — AP isolation (corporate/guest Wi-Fi) blocks discovery and often audio. Manual IP fallback required.
5. **Acoustic latency measurement (Method A)** not yet executed — pending hardware test.

## References

- Full architecture: `docs/arquitetura.md`
- Roadmap & gates: `docs/roadmap.md`
- Sprint 1 plan: `docs/sprint-01.md`
- Sprint 1 results: `docs/sprint-01-resultado.md`
- Latency methodology: `docs/latencia.md`
- Original briefing: `documenta_o_de_arquitetura_microfone_p2p.md`