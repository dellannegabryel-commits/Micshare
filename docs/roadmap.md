# Roadmap — Micshare

Cada fase termina em um **gate**: um critério verificável, não uma opinião. Fase que não passa no gate não avança; ou reduz escopo, ou muda a abordagem.

| Fase | Escopo | Gate (critério de saída) | Estimativa |
|---|---|---|---|
| **0 — Fundação** | Documentação, arquitetura, protocolo, plano de sprint | docs revisadas, board do kanban com a Sprint 1 | ✅ concluída |
| **1 — PoC de áudio** | Captura no celular → UDP → jitter buffer → saída no PC, IP fixo, sem controle, sem descoberta | áudio inteligível no PC por 10 min contínuos, latência medida **< 150 ms**, perda tolerada até 3% sem estalo audível | Sprint 1 (2 sem) |
| **2 — Zero config** | Beacon de descoberta, hello/welcome sem código, reconexão, cliente de teste | cliente fake conecta e envia áudio em **< 10 s**, sem digitar IP, em 3 redes diferentes | 1 sem |
| **3 — Controles** | WebSocket de controle, mute (duplo), volume, stats | mute responde em < 100 ms percebidos; volume audível em 10 passos; estado sobrevive a queda e reconexão do WS | 1 sem |
| **4 — Integração de sistema** | Seleção de dispositivo, roteamento para VB-CABLE/PipeWire/BlackHole, instalador do PC com checagem de cabo virtual | Discord reconhece e transmite o microfone; `npm run setup` valida cabo ausente e explica o que instalar | 2 sem |
| **5 — Polimento** | Opus (banda), buffer adaptativo refinado, UI do PC (Tauri), ícone de bandeja, auto-start, QR code, TLS/WebRTC se virar requisito | consumo < 40 kbit/s com Opus; UI com mute/volume/stats; release instalável assinado (Windows) | 3 sem |

Total até MVP utilizável (fim da Fase 4): **~6 semanas**.

## Ordem e por que ela não muda

1. **Áudio antes de tudo.** Se a latência não fechar em 150 ms, o produto não existe — e nenhuma UI salva isso. Fase 1 é a única com risco de "não dá".
2. **Descoberta antes de controles.** Descobrir e conectar é pré-requisito para testar controle; e o beacon é a parte que mais depende da rede do usuário, logo precisa de mais tempo de observação.
3. **Controles antes do cabo virtual.** Mute/volume são baratos e tornam os testes da Fase 4 suportáveis (testar cabo virtual com áudio que não cala é sofrimento).
4. **Cabo virtual por último no MVP.** Depende de software de terceiros instalado na máquina do usuário — é onde o suporte a usuário final começa.

## Cliente Mobile: Kotlin (Android) — Fase 2+

O cliente mobile será **Kotlin nativo com Jetpack Compose**, não React Native.

| Fase | Atividade Mobile |
|---|---|
| **1** | Testes com `fakeClient.js` (Node) simulando captura → valida jitter buffer + sink no PC |
| **2** | **Kotlin app**: AudioRecord → UDP 41235, OkHttp WebSocket 41236, BeaconListener 41234, Compose UI |
| **3** | Mute/volume/dual mute na UI, stats em tempo real |
| **4** | Teste de integração Discord/OBS com VB-CABLE |

**Por que Kotlin (e não React Native):**
- `AudioRecord`/`AudioTrack` são APIs estáveis do Android; RN precisa de módulos nativos + config plugins frágeis
- `DatagramSocket` + `NetworkCallback` para UDP nativo; `react-native-udp` não mantido
- APK ~5 MB vs ~30 MB RN; instalação instantânea, sem Metro/Expo
- `ForegroundService` (tipo `microphone`) para captura em background (futuro)
- Permissões diretas no `AndroidManifest.xml`

iOS (Swift) fica para depois do MVP Android validado.
