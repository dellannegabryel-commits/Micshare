# Roadmap — Micshare

Cada fase termina em um **gate**: um critério verificável, não uma opinião. Fase que não passa no gate não avança; ou reduz escopo, ou muda a abordagem.

| Fase | Escopo | Gate (critério de saída) | Estimativa |
|---|---|---|---|
| **0 — Fundação** | Documentação, arquitetura, protocolo, plano de sprint | docs revisadas, board do kanban com a Sprint 1 | ✅ concluída |
| **1 — PoC de áudio** | Captura no celular → UDP → jitter buffer → saída no PC, IP fixo, sem controle, sem descoberta | áudio inteligível no PC por 10 min contínuos, latência medida **< 150 ms**, perda tolerada até 3% sem estalo audível | Sprint 1 (2 sem) |
| **2 — Zero config** | Beacon de descoberta, lista de PCs no app, pareamento por código, reconexão | abrir o app com o PC rodando e chegar em áudio em **< 10 s**, sem digitar IP, em 3 redes diferentes | 1 sem |
| **3 — Controles** | WebSocket de controle, mute (duplo), volume, stats na UI do app | mute responde em < 100 ms percebidos; volume audível em 10 passos; estado sobrevive a queda e reconexão do WS | 1 sem |
| **4 — Integração de sistema** | Seleção de dispositivo, roteamento para VB-CABLE/PipeWire/BlackHole, instalador do PC com checagem de cabo virtual | Discord reconhece e transmite o microfone; `npm run setup` valida cabo ausente e explica o que instalar | 2 sem |
| **5 — Polimento** | Opus (banda), buffer adaptativo refinado, UI do PC (Tauri), ícone de bandeja, auto-start, QR code, TLS/WebRTC se virar requisito | consumo < 40 kbit/s com Opus; UI com mute/volume/stats; release instalável assinado (Windows) | 3 sem |

Total até MVP utilizável (fim da Fase 4): **~6 semanas**.

## Ordem e por que ela não muda

1. **Áudio antes de tudo.** Se a latência não fechar em 150 ms, o produto não existe — e nenhuma UI salva isso. Fase 1 é a única com risco de "não dá".
2. **Descoberta antes de controles.** Descobrir e conectar é pré-requisito para testar controle; e o beacon é a parte que mais depende da rede do usuário, logo precisa de mais tempo de observação.
3. **Controles antes do cabo virtual.** Mute/volume são baratos e tornam os testes da Fase 4 suportáveis (testar cabo virtual com áudio que não cala é sofrimento).
4. **Cabo virtual por último no MVP.** Depende de software de terceiros instalado na máquina do usuário — é onde o suporte a usuário final começa.

## Fora do roadmap (explicitamente)

- Android + iOS simultâneos como prioridade: começamos por **um** target mobile. Escolha do alvo na Sprint 1 (tarefa 1.3), com base em qual aparelho estiver em mãos para teste.
- Múltiplos celulares no mesmo PC, salas, gravação, efeitos.
- Publicação em loja (Play/App Store): distribuição por APK/testflight até o produto provar valor.
