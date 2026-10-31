import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const assetsDir = resolve(process.cwd(), "dist-bin");
mkdirSync(assetsDir, { recursive: true });

const nativeRoots = [
  resolve(process.cwd(), "node_modules/naudiodon2/build/Release"),
  resolve(process.cwd(), "node_modules/ws"),
];

for (const root of nativeRoots) {
  if (!fs.existsSync(root)) continue;
  const entries = fs.readdirSync(root, { recursive: true, fileTypes: ["file"] });
  for (const entry of entries) {
    const fullPath = path.join(root, entry);
    const relative = path.relative(root, fullPath);
    const dest = path.join(assetsDir, relative);
    mkdirSync(path.dirname(dest), { recursive: true });
    try { copyFileSync(fullPath, dest); console.log("[SEA] Asset:", dest); } catch (e) { console.error("[SEA] Erro:", e.message); }
  }
}

console.log("[SEA] Assets copiados para dist-bin");