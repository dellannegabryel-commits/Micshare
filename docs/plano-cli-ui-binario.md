# Plano — Interface/UI para a CLI do Micshare PC + Binário único

**Objetivo:** criar uma interface mais amigável para controlar o servidor PC (status, sessões, mute/volume, device, restart, disconnect) reutilizando o canal administrativo já existente (`packages/pc/src/cli/adminClient.ts`) e gerar um binário único (`micshare-pc.exe`) para distribuição.

**Escopo:** `packages/pc`. Não mexer em `packages/pc-ui` (Tauri/Rust) agora; essa UI do Node fica como alternativa/atalho e pode servir de referência.

---

## 1) Estado atual
- **CLI texto:** REPL in-process + `daemon`/`status`/`ctl` externos via named pipe/TCP + token
- **Contrato único:** `ServerStatus` + registry de comandos em `src/cli/commands.ts`
- **Canais:** UDP 41235, WS controle 41236, beacon 41234, admin local 41237/pipe
- **Build:** `tsc` → `dist/`
- **Bin:** `"bin": { "micshare-pc": "dist/index.js" }`

---

## 2) Decisões de arquitetura

### 2.1 Modo de UI
| Opção | Vantagens | Desvantagens | Decisão |
|---|---|---|---|
| **A) TUI (terminal)** — `ink` (React) ou `blessed`/`neo-blessed` | Roda no mesmo terminal, sem abrir browser, leve, ótimo p/ `micshare-pc ui` | Aparência menos "app", debugging menor em alguns terminais | **Preferida p/ uso rápido no PC** |
| **B) Web UI local** — `express` + `ws` + Vite build embutido ou servido de `dist/ui` | Familiar, mostra tabelas/gráficos, fácil p/ adicionar ações, pode abrir sozinho | Abre browser, consome um pouco mais de recursos | **Ótima p/ operação diária (recomendada)** |
| **C) Híbrido** — `ui` abre web local; `tui` opcional | Cobre ambos os casos | Mais código p/ manter | **Ideal (implementar B primeiro, A depois)** |

**Escolhido:** Híbrido. Começar por **Web UI local** (B) por reuso máximo do `ServerStatus` e clareza; manter TUI como `--tui` futuramente.

### 2.2 Comunicação com o servidor
**Nunca** duplicar lógica: a UI deve falar **exclusivamente** com o canal admin.

- `src/cli/adminClient.ts` já existe → criar `src/ui/client.ts` (thin wrapper) com `getStatus()`, `cmd()`, `isRunning()`
- Se o daemon não estiver rodando, mostrar "Servidor parado" + botão `Iniciar daemon` (chama `daemon start` via mesmo client/spawn)
- Tudo em `127.0.0.1` apenas
- `--json` já validado pelo contrato

### 2.3 Empacotamento em binário único
| Ferramenta | Suporte Node 24/ESM | Nativos (`naudiodon2`) | Windows `.exe` | Facilidade | Notas |
|---|---|---|---|---|---|
| **[Node SEA](https://nodejs.org/api/single-executable-applications.html)** (nativo) | Bom | Precisa copiar `.node` ao lado ou usar `postject` | Sim | Ótimo p/ longo prazo, sem deps pesadas | Recomendado. Precisa gerar `sea-config.json` + `postject`/ferramentas |
| **[@yao-pkg/pkg](https://github.com/yao-pkg/pkg)** | Suporte melhor que `pkg` original | Funciona com cuidado (`assets` + nativos) | Sim | Rápido p/ testar | Muito usado, mantém simples |
| **[nexe](https://github.com/nexe/nexe)** | Variável | Mais complexo | Sim | Possível mas menos ágil | Menor prioridade |
| **[bun build --compile](https://bun.sh/docs/bundler/executables)** | Não é Node | Diferente runtime | Sim | Interessante mas muda runtime (pode quebrar `naudiodon2`) | **Evitar por enquanto** (risco com módulo nativo) |

**Decisão:** começar com **@yao-pkg/pkg** (menor fricção agora) e migrar para **Node SEA** se ficar estável. Ambos geram `.exe` único.

---

## 3) Arquitetura proposta

### 3.1 Web UI local
Nova pasta: `packages/pc/src/ui/web/`

```
src/ui/
├── client.ts        # wrapper sobre adminClient (getStatus/cmd/isRunning)
├── server.ts        # Express local em 127.0.0.1:41238 (serve UI + /api/*)
└── web/             # frontend estático (buildado)
    ├── index.html
    ├── main.tsx     # React + Vite (ou vanilla + htmx) 
    ├── App.tsx
    └── components/
        ├── Header.tsx
        ├── StatusCard.tsx
        ├── SessionsTable.tsx
        ├── DeviceSelector.tsx
        ├── AudioControls.tsx  // mute/volume
        ├── Actions.tsx        // restart/disconnect/stop
        └── Logs.tsx
```

**Rotas API (todas via admin):**
| Método | Rota | Ação |
|---|---|---|
| `GET` | `/api/health` | `{running, transport, pid}` |
| `GET` | `/api/status` | `ServerStatus` bruto |
| `GET` | `/api/sessions` | sessões |
| `POST` | `/api/cmd` | `{cmd, args:[]}` → repassa ao `adminRequest` |
| `POST` | `/api/daemon/start` | `daemon start` |
| `POST` | `/api/daemon/stop` | `daemon stop` |
| `GET` | `/api/devices` | lista dispositivos |

**UI features:**
- Auto-refresh 1s (ou SSE)
- Status geral (portas, IPs, uptime, PID)
- Mute toggle + slider volume 0–4
- Trocar device com confirmação
- Lista sessões com "Disconnect"
- Restart (sink/control/beacon/all)
- "Iniciar/Parar daemon"
- Modo escuro simples
- Mostra canal admin (`pipe`/`tcp`)

### 3.2 CLI integration
Adicionar subcomando:

```bash
micshare-pc ui                # abre web UI em http://127.0.0.1:41238 e abre browser
micshare-pc ui --no-open      # só sobe o servidor web
micshare-pc ui --port 41239   # porta custom
micshare-pc tui              # (Fase 3) TUI com ink
```

Também atualizar `--help` e README/CLAUDE.

### 3.3 Build + binário
Scripts em `packages/pc/package.json`:

```json
{
  "scripts": {
    "build": "tsc && npm run build:ui",
    "build:ui": "vite build --config src/ui/web/vite.config.ts",
    "pack:pkg": "pkg . --targets node24-win-x64 --output dist-bin/micshare-pc.exe",
    "pack:sea": "node scripts/make-sea.mjs",
    "dist:win": "npm run build && npm run pack:pkg"
  },
  "pkg": {
    "assets": ["dist/**/*", "src/ui/web/dist/**/*", "node_modules/naudiodon2/build/Release/*.node"],
    "targets": ["node24-win-x64"],
    "outputPath": "dist-bin"
  }
}
```

**Notas:**
- Copiar `.node` nativos explicitamente
- Garantir que `naudiodon2` seja resolvido em runtime (testar com `--device`)
- Para Node SEA, injetar assets via `postject` ou ler do filesystem ao lado do exe

---

## 4) Fases de implementação

### Fase U1 — Infra UI (0,5 d)
| # | Tarefa | Dep |
|---|---|---|
| U1.1 | `src/ui/client.ts` (wrapper sobre `adminClient`) | — |
| U1.2 | `src/ui/server.ts` (Express + estático + `/api/*`) | U1.1 |
| U1.3 | Adicionar `ui` ao `src/index.ts` + `--help` | U1.2 |
| U1.4 | Abrir browser (`open`/`start`) com fallback | U1.3 |

**DoD:** `micshare-pc ui --no-open` sobe e responde `GET /api/health`

### Fase U2 — Web UI (1 d)
| # | Tarefa | Dep |
|---|---|---|
| U2.1 | Setup Vite em `src/ui/web/` (React + TS + CSS minimal) | U1 |
| U2.2 | `StatusCard`, `SessionsTable`, `DeviceSelector`, `AudioControls` | U2.1 |
| U2.3 | `Actions` (mute/volume/restart/disconnect) + `daemon start/stop` | U2.2 |
| U2.4 | Polling 1s + estados loading/erro | U2.3 |
| U2.5 | Build integrado (`build:ui`) e servido pelo `ui/server.ts` | U2.4 |

**DoD:** UI funcional controlando daemon via web (testado em Chrome)

### Fase U3 — Binário único (0,5–1 d)
| # | Tarefa | Dep |
|---|---|---|
| U3.1 | Testar `@yao-pkg/pkg` com assets + `naudiodon2` | U2 |
| U3.2 | Ajustar `pkg` config e paths (`__dirname` vs `process.pkg.entrypoint`) | U3.1 |
| U3.3 | Gerar `micshare-pc.exe` e testar fora da pasta repo (`status`, `ui`, `daemon start`) | U3.2 |
| U3.4 | (Opcional) Script Node SEA (`scripts/make-sea.mjs`) | U3.3 |
| U3.5 | Atualizar README/CLAUDE com instruções de build/binário | U3.4 |

**DoD:** `dist-bin/micshare-pc.exe` abre UI, conecta ao daemon/admin e controla áudio

### Fase U4 — Polimento (opcional, 0,5 d)
| # | Tarefa | Dep |
|---|---|---|
| U4.1 | TUI com `ink` (`micshare-pc tui`) | U2 |
| U4.2 | Ícone, versão no header, auto-atualização visual | U4.1 |
| U4.3 | Toasts de sucesso/erro | U4.2 |

---

## 5) Dependências a adicionar

```json
// packages/pc/package.json
{
  "dependencies": {
    "express": "^4.21.2",
    "open": "^10.1.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@yao-pkg/pkg": "^6.1.1",
    "vite": "^6.0.7",
    "@vitejs/plugin-react": "^4.3.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@types/express": "^5.0.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1"
  }
}
```

*(Se optar por TUI: `ink`, `react`, `pastel`)*

---

## 6) Riscos & Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| **`naudiodon2` nativo não carrega no exe** | Alto | Testar cedo com `pkg.assets` incluindo `build/Release/*.node`. Ter cópia ao lado do exe como fallback |
| **Paths ESM** (`fileURLToPath`, `__dirname`) quebram empacotado | Alto | Usar `path.resolve(process.cwd())` ou `app.get('env')` e servir UI de pasta relativa ao exe |
| **Named pipe não acessível / permissão** | Médio | Já tratado (fallback TCP + token). UI mostra transporte atual |
| **Porta 41238 em uso** | Baixo | `--port` + erro claro com sugestão |
| **Firewall Windows** | Médio | Aviso na UI "rodando em 127.0.0.1" (local-only) |

---

## 7) Checklist inicial p/ começar
- [ ] Criar `docs/plano-cli-ui-binario.md` (feito)
- [ ] Adicionar deps `express`, `open`, `cors` + Vite/React
- [ ] Implementar `src/ui/client.ts` + `src/ui/server.ts`
- [ ] Integrar `micshare-pc ui` no `src/index.ts`
- [ ] Protótipo UI mínimo (status + mute/volume + sessions)
- [ ] Testar com daemon rodando
- [ ] Configurar `pkg` e gerar primeiro `.exe`
- [ ] Validar fora do repo

---

## 8) Ordem sugerida
`U1.1 → U1.2 → U1.3 → U2.1 → U2.2 → U2.3 → U2.5 → U3.1 → U3.3`

**Caminho crítico:** canal admin → UI web → empacotamento com módulo nativo.

**Próximo passo:** começar pela **Fase U1** (criar `src/ui/client.ts` e `src/ui/server.ts`) e commitar esse plano.
