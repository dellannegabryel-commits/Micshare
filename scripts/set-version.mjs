#!/usr/bin/env node
/**
 * Sincroniza a versão do release em todos os manifests do repositório.
 *
 * Uso:
 *   node scripts/set-version.mjs 0.4.0          # aplica a versão
 *   node scripts/set-version.mjs --check 0.4.0  # só verifica (exit 1 se divergir)
 *
 * É a única fonte de verdade usada tanto no desenvolvimento local quanto no CI,
 * evitando regex frouxas que corrompiam dependências no Cargo.toml.
 *
 * Cada manifest declara como extrair ("get") e como gravar ("set") a versão:
 * a verificação compara a VERSÃO extraída, não o texto do arquivo — assim o
 * lockfile do npm pode ter a formatação que quiser sem acusar divergência.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Converte "1.2.3" em um versionCode monotônico: major*10000 + minor*100 + patch. */
function versionCode(version) {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map((n) => parseInt(n, 10) || 0);
  return major * 10000 + minor * 100 + patch;
}

const SEMVER = /^\d+\.\d+\.\d+$/;

// Cargo.toml: só a seção [package]; as dependências mantêm suas versões.
const CARGO_PACKAGE_VERSION = /(\[\[?package\]?\][\s\S]*?^version\s*=\s*")([^"]+)(")/m;
const CARGO_LOCK_VERSION = /(\[\[package\]\]\nname = "micshare-pc-ui"\nversion = )"([^"]+)"/;
// package-lock.json: versão do pacote raiz (top-level) e do workspace raiz.
const LOCK_ROOT_VERSION = /^\s*"version"\s*:\s*"([^"]+)"/m;
const LOCK_WORKSPACE_VERSION = /("packages"\s*:\s*\{\s*\n\s*""\s*:\s*\{\s*\n\s*"name"\s*:\s*"[^"]+",\s*\n\s*"version"\s*:\s*")([^"]+)(")/;

const EDITORS = {
  'pc/src-tauri/Cargo.toml': {
    get: (c) => c.match(CARGO_PACKAGE_VERSION)?.[2],
    set: (c, v) => c.replace(CARGO_PACKAGE_VERSION, `$1${v}$3`),
  },

  'pc/src-tauri/Cargo.lock': {
    get: (c) => c.match(CARGO_LOCK_VERSION)?.[2],
    set: (c, v) => c.replace(CARGO_LOCK_VERSION, `$1"${v}"`),
  },

  'pc/src-tauri/tauri.conf.json': {
    get: (c) => c.match(/^\s*"version"\s*:\s*"([^"]+)"/m)?.[1],
    set: (c, v) => c.replace(/^(\s*"version"\s*:\s*")[^"]+(")/m, `$1${v}$2`),
  },

  'pc/package.json': {
    get: (c) => c.match(/^\s*"version"\s*:\s*"([^"]+)"/m)?.[1],
    set: (c, v) => c.replace(/^(\s*"version"\s*:\s*")[^"]+(")/m, `$1${v}$2`),
  },

  'package.json': {
    get: (c) => c.match(/^\s*"version"\s*:\s*"([^"]+)"/m)?.[1],
    set: (c, v) => c.replace(/^(\s*"version"\s*:\s*")[^"]+(")/m, `$1${v}$2`),
  },

  'package-lock.json': {
    get: (c) => {
      const root = c.match(LOCK_ROOT_VERSION)?.[1];
      const workspace = c.match(LOCK_WORKSPACE_VERSION)?.[2];
      return root && workspace && root === workspace ? root : `${root ?? '?'}/${workspace ?? '?'}`;
    },
    set: (c, v) =>
      c
        .replace(/^(\s*"version"\s*:\s*")[^"]+(")/m, `$1${v}$2`)
        .replace(LOCK_WORKSPACE_VERSION, `$1${v}$3`),
  },

  'mobile/app/build.gradle.kts': {
    get: (c) => {
      const name = c.match(/versionName\s*=\s*"([^"]+)"/)?.[1];
      const code = c.match(/versionCode\s*=\s*(\d+)/)?.[1];
      return name && code ? `${name} (code ${code})` : name;
    },
    set: (c, v) =>
      c
        .replace(/(versionName\s*=\s*")[^"]+(")/, `$1${v}$2`)
        .replace(/(versionCode\s*=\s*)\d+/, `$1${versionCode(v)}`),
  },
};

function main(argv) {
  const args = argv.filter((a) => a !== '--check');
  const check = argv.includes('--check');
  const version = args[0];

  if (!version || !SEMVER.test(version)) {
    console.error('Uso: node scripts/set-version.mjs [--check] <semver ex.: 0.4.0>');
    process.exit(2);
  }

  const divergentes = [];

  for (const [relative, editor] of Object.entries(EDITORS)) {
    const path = resolve(ROOT, relative);
    const current = readFileSync(path, 'utf8');
    const atual = editor.get(current);
    const esperado = relative.endsWith('build.gradle.kts') ? `${version} (code ${versionCode(version)})` : version;

    if (atual === esperado) {
      console.log(`= ${relative} (já está em ${version})`);
      continue;
    }

    if (check) {
      divergentes.push(relative);
      console.log(`! ${relative} está em "${atual}" e deveria estar em "${esperado}"`);
      continue;
    }

    writeFileSync(path, editor.set(current, version));
    console.log(`✓ ${relative} -> ${version}`);
  }

  if (check && divergentes.length > 0) {
    console.error(`\n${divergentes.length} arquivo(s) fora de ${version}:`);
    for (const file of divergentes) console.error(`  - ${file}`);
    process.exit(1);
  }

  console.log(check ? `\nTudo consistente em ${version}.` : `\nVersão ${version} aplicada.`);
}

main(process.argv.slice(2));
