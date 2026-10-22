# Micshare

Microfone sem fio: o celular vira microfone de entrada do PC pela rede local, com baixa latência e zero configuração.

```
celular (React Native) ──UDP/Wi-Fi──> PC (Node + TypeScript) ──> cabo virtual ──> Discord / OBS / jogos
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/arquitetura.md`](docs/arquitetura.md) | protocolo de áudio (header binário), jitter buffer, controle via WebSocket, descoberta, roteamento para VB-CABLE/PipeWire/BlackHole, orçamento de latência, decisões e riscos |
| [`docs/roadmap.md`](docs/roadmap.md) | fases 0–5 com gates verificáveis (~6 semanas até MVP utilizável) |
| [`docs/sprint-01.md`](docs/sprint-01.md) | plano da sprint atual (PoC de áudio), tarefas, DoD e checklist de teste |
| [`documenta_o_de_arquitetura_microfone_p2p.md`](documenta_o_de_arquitetura_microfone_p2p.md) | briefing original |

## Estado

Fase 0 (fundação) concluída: documentação e board prontos. Sprint 01 em planejamento — nenhum código escrito ainda.

## Stack

- **PC:** Node 24 + TypeScript, `dgram` (áudio), `ws` (controle), `naudiodon2` (saída via PortAudio).
- **Mobile:** React Native + TypeScript, `react-native-audio-api` (captura PCM), `react-native-udp` (transporte).
- **Cabo virtual (obrigatório para uso real, não para o PoC):** VB-CABLE (Windows), PipeWire (Linux), BlackHole (macOS).

## Kanban

```bash
hermes kanban list          # board micshare
```

Tarefas da Sprint 01 em `ready`, o gate (S1.8) e as fases seguintes em `todo`, presos por dependência.

## Limitações conhecidas do MVP

- Sem criptografia: o áudio trafega em claro na LAN (ver `docs/arquitetura.md` §10).
- Depende de cabo virtual instalado no PC para que o sistema enxergue um microfone.
- Redes com isolamento de cliente (AP corporativo/guests) impedem descoberta e frequentemente o áudio — usar IP manual quando aplicável.
# trigger
# trigger
# trigger
