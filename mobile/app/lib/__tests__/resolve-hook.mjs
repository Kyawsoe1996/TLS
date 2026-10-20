// Module resolution for the node checks: maps the app's "@/…" and "@shared/…" aliases (tsconfig paths) and
// extensionless relative imports onto .ts / .tsx files, which Node's ESM loader doesn't do on its own.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHARED_ROOT = path.resolve(APP_ROOT, "../shared");
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

function withExtension(file) {
  if (path.extname(file) && existsSync(file)) return file;
  for (const ext of EXTENSIONS) if (existsSync(file + ext)) return file + ext;
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let file = null;
  if (specifier.startsWith("@/")) file = path.join(APP_ROOT, specifier.slice(2));
  else if (specifier.startsWith("@shared/")) file = path.join(SHARED_ROOT, specifier.slice("@shared/".length));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    file = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (file) {
    const found = withExtension(file);
    if (found) return nextResolve(pathToFileURL(found).href, context);
  }
  return nextResolve(specifier, context);
}
