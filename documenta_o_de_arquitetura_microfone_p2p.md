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

*   **Streaming de Áudio (UDP / WebRTC):** Protocolos sem garantia de entrega (UDP puro com PCM raw/Opus) ou WebRTC para priorizar a velocidade. TCP não deve ser usado para o fluxo contínuo de áudio para evitar *buffering* excessivo em caso de perda de pacotes.
*   **Sinalização e Controle (TCP / WebSockets):** Usado para enviar comandos críticos que precisam de garantia de entrega, como "Mute", "Volume Up", "Volume Down" e "Disconnect".
*   **Descoberta (mDNS / UDP Broadcast):** O PC anuncia sua presença na rede (ex: Bonjour/Zeroconf). O app escuta a rede, captura o IP do PC automaticamente e inicia o handshake.

## 4. Stack Tecnológica Recomendada
*   **Client (Mobile):** React Native (TypeScript) ou Kotlin/Swift Nativo. 
    *   *Justificativa:* Facilidade em construir interfaces e acesso a bibliotecas UDP/WebRTC.
*   **Server/Receiver (PC):** Node.js (via aplicação de terminal ou encapsulado em Electron/Tauri para interface gráfica).
    *   *Justificativa:* Excelente ecossistema para WebSockets, mDNS e processamento de streams.
*   **Roteamento Virtual (Obrigatório):**
    *   *Windows:* VB-Cable (Virtual Audio Cable).
    *   *Linux:* PipeWire (Virtual Loopback).
    *   *Mac:* BlackHole.

## 5. Plano de Implementação (Fases)

### Fase 1: Prova de Conceito (Áudio Básico)
1. Criar um servidor UDP em Node.js (`dgram`) no PC.
2. Criar um app mobile básico que captura amostras do microfone (PCM 16-bit) e envia pacotes UDP para o IP do PC.
3. Receber os buffers no PC e reproduzi-los usando `node-speaker` para validar a latência.

### Fase 2: Auto-Descoberta (Zero Configuração)
1. Implementar `bonjour-service` (mDNS) no Node.js para anunciar um serviço (ex: `_p2pmic._udp`).
2. No app mobile, usar biblioteca mDNS para localizar o serviço, resgatar o IP/Porta e conectar.

### Fase 3: Controles de Mute e Volume
1. Subir um servidor WebSocket paralelo ao servidor UDP no PC.
2. **Mute:** O app para a transmissão UDP e envia o estado via WebSocket.
3. **Volume:** O app envia um multiplicador (ex: `1.2`) via WebSocket; o Node.js multiplica as amostras PCM antes da reprodução.

### Fase 4: Integração com Driver Virtual
1. Configurar o output da aplicação Node.js para direcionar o áudio exclusivamente para o "Virtual Audio Cable" (Dispositivo de Saída Virtual).
2. Definir o "Virtual Audio Cable" (Dispositivo de Entrada) como o microfone padrão do sistema operacional.