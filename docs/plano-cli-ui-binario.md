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

**Decisão:** começar com **Node.js SEA** (nativo do Node 24) e, se necessário, migrar para `pkg` posteriormente. Ambos geram `.exe` único.

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
- Mostra canal admin (`pipe`/`tcp`

### 3.2 CLI integration
Adicionar subcomando:

```bash
micshare-pc ui                # abre web UI em http://127.0.0.1:41238 e abre browser
micshare-pc ui --no-open      # só sobe o servidor web
micshare-pc ui --port 41239   # porta custom
micshare-pc tui              # (Fase 3) TUI com ink
```

Também atualizar `--help` e README/CLAUDE.

### 3.3 Build + binário (Sea)

Scripts em `packages/pc/package.json`:

```json
{
  "scripts": {
    "build": "tsc && npm run build:ui",
    "build:ui": "vite build --config src/ui/web/vite.config.ts",
    "sea:build": "node scripts/sea-build.mjs",
    "dist:win": "npm run build && npm run sea:build"
  },
  "sea": {
    "main": "dist/index.js",
    "name": "micshare-pc",
    "assets": ["dist/**/*", "src/ui/web/dist/**/*", "node_modules/naudiodon2/build/Release/*.node"],
    "targets": ["node24-win-x64"]
  }
}
```

**Script `scripts/sea-build.mjs`:**

```mjs
import { create } from 'node:module';
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 1. Build tsc
console.log('[SEA] Rodando tsc...');

// 2. Coletar assets nativos
const assetsDir = resolve(process.cwd(), 'dist-bin');
mkdirSync(assetsDir, { recursive: true });

const nativeRoots = [
  resolve(process.cwd(), 'node_modules/naudiodon2/build/Release'),
  resolve(process.cwd(), 'node_modules/ws'),
];

for (const root of nativeRoots) {
  if (!fs.existsSync(root)) continue;
  const entries = fs.readdirSync(root, { recursive: true, fileTypes: ['file'] });
  for (const entry of entries) {
    const fullPath = path.join(root, entry);
    const relative = path.relative(root, fullPath);
    const dest = path.join(assetsDir, relative);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(fullPath, dest);
    console.log(`[SEA] Asset: ${dest}`);
  }
}

// 3. Injetar SEA usando Module.createAutoDetect
console.log('[SEA] Build do executável...');
 // Nota: Em Node 24, usa-se: npx esbuild ... --inject-main
 // Ou: npx pkg-compat ... (workaround)

console.log('[SEA] Pronto. Execute: dist-bin/micshare-pc.exe');
```

### Fase U3 — Binário único (0,5–1 d)

| # | Tarefa | Dep |
|---|---|---|
| U3.1 | Criar `sea-config.json` e `scripts/sea-build.mjs` | U2 |
| U3.2 | Rodar `npm run sea:build` e testar `dist-bin/micshare-pc.exe` | U3.1 |
| U3.3 | Validar `status`, `ui`, `daemon start` fora da pasta repo | U3.2 |
| U3.4 | (Opcional) Manter compatibilidade com `pkg` como fallback | U3.3 |
| U3.5 | Atualizar README/CLAUDE com instruções de build Sea | U3.4 |

**DoD:** `dist-bin/micshare-pc.exe` abre UI, conecta ao daemon/admin e controla áudio

---

## 6) Riscos & Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| **`naudiodon2` nativo não carrega no exe** | Alto | Testar cedo com `sea-build.mjs` copiando `build/Release/*.node`. Fallback: execução via `tsx` |
| **Paths ESM** (`fileURLToPath`, `__dirname`) quebram empacotado | Alto | Usar `path.resolve(process.cwd())` e servir UI de pasta relativa ao exe |
| **Named pipe não acessível / permissão** | Médio | Já tratado (fallback TCP + token). UI mostra transporte atual |
| **Porta 41238 em uso** | Baixo | `--port` + erro claro com sugestão |
| **Firewall Windows** | Médio | Aviso na UI "rodando em 127.0.0.1" (local-only) |

---

## 7) Checklist inicial p/ começar
- [x] Criar `docs/plano-cli-ui-binario.md` (feito)
- [x] Adicionar deps `express`, `open`, `cors` + Vite/React
- [x] Implementar `src/ui/client.ts` + `src/ui/server.ts`
- [x] Integrar `micshare-pc ui` no `src/index.ts`
- [x] Protótipo UI mínimo (status + mute/volume + sessions) — validado com `micshare-pc ui`
- [x] Testar com daemon rodando
- [ ] Criar `sea-config.json` e `scripts/sea-build.mjs`
- [ ] Gerar `micshare-pc.exe` via Node.js 24 SEA e validar
- [ ] Validar fora do repo

---

## 8) Ordem sugerida
`U1.1 → U1.2 → U1.3 → U2.1 → U2.2 → U2.3 → U2.5 → U3.1 → U3.3 → U3b` (migração Sea)

**Caminho crítico:** canal admin → UI web → empacotamento Sea.

**Próximo passo:** configurar o `sea-config.json` e gerar o primeiro `.exe` via Node.js 24 SEA.

---

## 9) Histórico de Commits

| Commit | Título | Descrição |
|---|---|---|
| `a107803` | Fase 1: CLI REPL + estado | REPL, status/mute/volume/device/disconnect/restart/pair/beacon, ServerStatus, 41 testes |
| `2f79f33` | Fase 2: daemon + controle externo | AdminServer/AdminClient (named pipe/TCP + token), daemon start/stop/status, ctl externo |
| `f71f3ee` | UI web local para controle do servidor | ui/client, ui/server, ui/web/dist, comando `micshare-pc ui` |
| `57ffe59` | Docs: plano UI web local + binário unico | Documentação completa das fases U1-U4 |
| `9cc2eed` | Chore: arquivos gerados pelo ambiente | package-lock.json, pnpm-lock.yaml, tsconfig.tsbuildinfo |
| `a107803` |feat(pc): CLI de controle com REPL, status, mute/volume, disconnect e restart (Fase 1) | Primeiro commit da Fase 1 |

---

## 10) Status Atual (30/10/2026)

- **Fase 1 (CLI REPL):** ✅ Concluída — 41 testes verdes, `tsc --noEmit` limpo
- **Fase 2 (Daemon + controle externo):** ✅ Concluída — AdminServer/AdminClient testados, exit codes 0/1/2
- **Fase UI (Web local):** ✅ Concluída — `micshare-pc ui` abre painel funcional em http://127.0.0.1:41238
- **Fase Sea (Binário .exe):** ⏳ Em andamento — Documentação pronta, aguardando execução do `sea-build.mjs`

**Próximo passo:** Executar a migração para Node.js Sea e gerar o primeiro binário `micshare-pc.exe`.