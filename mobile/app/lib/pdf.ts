// One-page PDFs made on the phone and handed to the share sheet: the deposit receipt (lib/receipt.ts) and the
// monthly report (lib/reportHtml.ts) both go through here.
//
// Free, with nothing to set up: expo-print renders our HTML into a PDF on the device and expo-sharing opens the
// share sheet (LINE, WhatsApp, Mail, Files...). Both are native modules, so they are loaded on demand: in a build
// that doesn't carry them yet `pdfAvailable()` is false and the screens hide their button instead of crashing.
//
// The order matters: ask expo-modules-core whether the native module exists BEFORE requiring the package. A
// `require` that fails at runtime (outside the app's start-up) is reported by Metro as a fatal error, not thrown,
// so a try/catch alone would still red-screen a build that lacks the module.
//
// No Expo import at the top of this file: `fileSlug` and `dateStamp` are used by the receipt and report builders,
// which run in node tests. `expo` is required only when a PDF is actually wanted.
type PrintModule = typeof import("expo-print");
type SharingModule = typeof import("expo-sharing");
type FileSystemModule = typeof import("expo-file-system");

let modules: { print: PrintModule; sharing: SharingModule; fs: FileSystemModule | null } | null | undefined;

function hasNative(name: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- kept out of the module's top level for the node tests
  const { requireOptionalNativeModule } = require("expo") as typeof import("expo");
  return requireOptionalNativeModule(name) != null;
}

function getModules() {
  if (modules !== undefined) return modules;
  if (!hasNative("ExpoPrint") || !hasNative("ExpoSharing")) {
    modules = null;
    return modules;
  }
  /* eslint-disable @typescript-eslint/no-require-imports -- native modules, loaded only once we know they exist */
  const print = require("expo-print") as PrintModule;
  const sharing = require("expo-sharing") as SharingModule;
  const fs = hasNative("ExpoFileSystem") ? (require("expo-file-system") as FileSystemModule) : null;
  /* eslint-enable @typescript-eslint/no-require-imports */
  modules = { print, sharing, fs };
  return modules;
}

/** True when this build can make and share a PDF (Expo Go and every build made after expo-print was added). */
export function pdfAvailable(): boolean {
  return getModules() !== null;
}

/** A5 portrait in points (what expo-print's width / height take). */
export const A5 = { width: 420, height: 595 } as const;
/** A4 portrait in points. */
export const A4 = { width: 595, height: 842 } as const;

/**
 * Render `html` to a PDF in the app's cache, name it `fileName` (Android shows the name in the viewer and in
 * LINE) and open the share sheet with it. Resolves when the sheet closes; the phone doesn't say whether the
 * person actually sent it. Throws when the build has no print module.
 */
export async function sharePdf(html: string, fileName: string, size: { width: number; height: number } = A5, dialogTitle = "Share"): Promise<void> {
  const mods = getModules();
  if (!mods) throw new Error("This build can't make PDFs yet. Install the latest build and try again.");
  const { uri } = await mods.print.printToFileAsync({ html, width: size.width, height: size.height, base64: false });
  // expo-print names the file after the time it was made; give it a name people will recognise. Two ways, the
  // current File API first, the legacy one as a fallback; if both fail the file is shared under its original name
  // and the reason is logged for the next test run.
  let shareUri = uri;
  if (mods.fs) {
    try {
      const target = new mods.fs.File(mods.fs.Paths.cache, fileName);
      if (target.exists) target.delete();
      new mods.fs.File(uri).move(target);
      if (target.exists) shareUri = target.uri;
    } catch (err) {
      console.warn("[pdf] rename with the File API failed", err);
    }
  }
  if (shareUri === uri && hasNative("ExponentFileSystem")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- same module, legacy entry point
      const legacy = require("expo-file-system/legacy") as typeof import("expo-file-system/legacy");
      const to = `${legacy.cacheDirectory ?? ""}${fileName}`;
      if (legacy.cacheDirectory) {
        await legacy.deleteAsync(to, { idempotent: true });
        await legacy.moveAsync({ from: uri, to });
        shareUri = to;
      }
    } catch (err) {
      console.warn("[pdf] rename with the legacy API failed", err);
    }
  }
  if (!(await mods.sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
  await mods.sharing.shareAsync(shareUri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle });
}

/** A file-name-safe slug from a shop or client name: "Sathorn Bespoke" → "Sathorn-Bespoke"; "" when nothing survives. */
export function fileSlug(value: string, max = 24): string {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

/** "20261020" for a file name. */
export function dateStamp(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
