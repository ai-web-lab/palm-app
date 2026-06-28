// MediaPipe の WASM を node_modules から public/ へコピーする。
// 巨大バイナリ（~30MB）なので git には含めず、build/dev 前に毎回用意する。
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.warn(
    "[copy-mediapipe-wasm] source not found (skip):",
    src,
    "— run `npm install` first.",
  );
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[copy-mediapipe-wasm] copied wasm ->", dest);
