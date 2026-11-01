# Projeto: App de Microfone P2P em Rede Local

## 1. Visão Geral
Sistema composto por um aplicativo mobile (Client) e um aplicativo desktop (Server) que transforma o smartphone em um microfone para o PC via rede local (Wi-Fi), com baixa latência e recursos de descoberta automática.

## 2. Requisitos Principais
*   **Baixa Latência:** Áudio em tempo real sem atrasos perceptíveis.
*   **Controles:** Botão de Mute e ajuste de Volume no app.
*   **Descoberta Automática:** Conexão "Zero Config" na rede local, sem necessidade de digitar IP.
*   **Integração de Sistema:** O áudio deve ser reconhecido pelo PC como um dispositivo de *entrada* (Microfone) para uso em jogos, Discord, reuniões, etc.

## 3. Arquitetura de Comunicação (Camadas)
O fluxo de dados é dividido para otimizar performance e confiabilidade:

*   **Streaming de Áudio (UDP):** PCM 16-bit little-endian, mono, 48 kHz, blocos de 10 ms (960 B). Header binário de 16 B com `seq`, `captureTs`, `flags`. UDP puro — sem retransmissão, sem agrupamento. Perda mascarada por PLC zero-order no jitter buffer.
*   **Sinalização e Controle (WebSocket/TCP):** JSON sobre WebSocket. Mensagens: `hello`/`welcome` (handshake), `mute`, `volume`, `bye`, `stats` (1 Hz). WebSocket garante entrega ordenada para controles.
*   **Descoberta (UDP Broadcast):** PC anuncia beacon 1 Hz em `255.255.255.255:41234` e broadcast de sub-rede. App escuta, monta lista, usuário toca para conectar. Fallback: IP manual. mDNS fica como camada opcional (Fase 2.5) — beacon UDP é primário pois evita dependência nativa no mobile.

## 4. Stack Tecnológica Recomendada
*   **Client (Mobile):** Kotlin nativo com Jetpack Compose (Android).
    *   *Justificativa:* `AudioRecord`/`AudioTrack` são APIs estáveis do Android; `DatagramSocket` + `NetworkCallback` para UDP nativo sem dependências extras; APK ~5 MB; `ForegroundService` tipo `microphone` para captura em background (futuro). iOS (Swift) fica para depois do MVP Android validado.
*   **Server/Receiver (PC):** Node.js (via aplicação de terminal ou encapsulado em Tauri para interface gráfica).
    *   *Justificativa:* Excelente ecossistema para WebSockets, UDP broadcast, processamento de streams; iteração rápida em TypeScript; CPU de PCM/Opus é irrelevante.
*   **Roteamento Virtual (Obrigatório):**
    *   *Windows:* VB-Cable (Virtual Audio Cable).
    *   *Linux:* PipeWire (Virtual Loopback).
    *   *Mac:* BlackHole.

## 5. Plano de Implementação (Fases)

### Fase 1: Prova de Conceito (Áudio Básico)
1. Criar protocolo binário compartilhado (header 16 B, encode/decode, validação).
2. Criar servidor UDP em Node.js (`dgram`) no PC com jitter buffer adaptativo (2–8 frames).
3. Testar com `fakeClient.js` (Node) enviando frames sintéticos → valida jitter buffer + sink.
4. Saída de áudio no PC via `naudiodon2` (PortAudio) ou ffplay fallback.

### Fase 2: Auto-Descoberta (Zero Configuração) + Cliente Kotlin
1. Implementar beacon UDP broadcast no PC (1 Hz, JSON com nome, portas).
2. Criar app Android nativo (Kotlin + Compose): `AudioRecord` → 10 ms frames → `DatagramSocket` UDP 41235.
3. `BeaconListener` no app (UDP 41234) → lista PCs → tap → WebSocket `hello` → `welcome` com `sessionId`.
4. Fallback IP manual para redes com isolamento de cliente (AP isolation).

### Fase 3: Controles de Mute e Volume
1. Mute duplo: app para envio UDP + servidor descarta frames (`flags.MUTED` no header).
2. Volume: multiplicador `[0, 4]` clampado no servidor antes do sink.
3. Stats 1 Hz via WebSocket (`lossPct`, `bufferMs`, `seqGaps`, `reconnects`) exibidos na UI.

### Fase 4: Integração com Driver Virtual
1. Seleção de dispositivo de saída no PC (`--device "CABLE"`).
2. `naudiodon2` lista dispositivos, match parcial case-insensitive ("cable", "vb-audio", "virtual").
3. Discord/OBS reconhecem `CABLE Output (VB-Audio Virtual Cable)` como microfone.
4. `npm run install-vbcable` (PowerShell, precisa Admin + reinício) para instalar VB-CABLE.