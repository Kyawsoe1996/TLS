#!/usr/bin/env node
// Generates the placeholder TLS app icons from inline SVG.
//
// Outputs (relative to mobile/):
//   docs/brand/icon.svg, adaptive-icon.svg, splash-icon.svg   (sources)
//   app/assets/icon.png            1024x1024, opaque navy      (iOS + fallback)
//   app/assets/adaptive-icon.png   1024x1024, transparent      (Android foreground, content inside inner 66%)
//   app/assets/splash-icon.png     1024x1024, transparent      (splash, resizeMode contain)
//   app/assets/favicon.png         48x48                       (web)
//
// Run from a directory where `sharp` (preferred) or `@resvg/resvg-js` is installed, e.g.
//   cd "$(mktemp -d)" && npm i --silent sharp && node /path/to/mobile/docs/brand/make-icons.mjs
// or via npx:
//   npx -y -p sharp -c 'node /path/to/mobile/docs/brand/make-icons.mjs'
//   npx -y -p @resvg/resvg-js -c 'node /path/to/mobile/docs/brand/make-icons.mjs'
// Do not commit node_modules; the renderer is only needed to regenerate the PNGs.

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url)); // mobile/docs/brand
const mobileDir = resolve(here, "../..");
const assetsDir = join(mobileDir, "app", "assets");
mkdirSync(assetsDir, { recursive: true });

const NAVY = "#14213A";
const GOLD = "#D1AC66";
const SERIF = "Georgia, 'Times New Roman', 'DejaVu Serif', 'Noto Serif', serif";

// Baseline so that capital letters sit visually centred: y = 512 + capHeight/2, capHeight ~= 0.69em.
const monogram = (fontSize, letterSpacing) =>
  `<text x="512" y="${Math.round(512 + 0.69 * fontSize * 0.5)}" text-anchor="middle" ` +
  `font-family="${SERIF}" font-size="${fontSize}" font-weight="bold" ` +
  `letter-spacing="${letterSpacing}" fill="${GOLD}">TLS</text>`;

const ring = (r, width, opacity = 1) =>
  `<circle cx="512" cy="512" r="${r}" fill="none" stroke="${GOLD}" stroke-width="${width}" opacity="${opacity}"/>`;

const svg = (body, background) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n` +
  (background ? `  <rect width="1024" height="1024" fill="${background}"/>\n` : "") +
  body.map((l) => "  " + l).join("\n") +
  "\n</svg>\n";

const sources = {
  // Full-bleed navy square; iOS applies its own mask. No transparency.
  "icon.svg": svg([ring(372, 14), ring(346, 3, 0.6), monogram(300, 10)], NAVY),
  // Android adaptive foreground: transparent, everything inside the inner 66% (676px) circle.
  "adaptive-icon.svg": svg([ring(300, 12), ring(278, 3, 0.6), monogram(230, 8)], null),
  // Splash mark: transparent, shown on a navy background at imageWidth via expo-splash-screen.
  "splash-icon.svg": svg([ring(400, 16), ring(372, 3, 0.6), monogram(320, 12)], null),
};

for (const [name, content] of Object.entries(sources)) {
  writeFileSync(join(here, name), content);
}

// Locate a renderer. Checks cwd, the script dir and any npx `-p` package dir on PATH.
function tryRequire(name) {
  const bases = [process.cwd(), here, mobileDir];
  for (const p of (process.env.PATH || "").split(":")) {
    if (p.endsWith("node_modules/.bin")) bases.push(resolve(p, "../.."));
  }
  for (const base of bases) {
    try {
      return createRequire(join(base, "package.json"))(name);
    } catch {
      /* try next */
    }
  }
  return null;
}

const outputs = [
  { file: "icon.png", src: "icon.svg", size: 1024, opaque: true },
  { file: "adaptive-icon.png", src: "adaptive-icon.svg", size: 1024, opaque: false },
  { file: "splash-icon.png", src: "splash-icon.svg", size: 1024, opaque: false },
  { file: "favicon.png", src: "icon.svg", size: 48, opaque: true },
];

async function renderWithSharp(sharp) {
  for (const o of outputs) {
    let img = sharp(Buffer.from(sources[o.src])).resize(o.size, o.size);
    if (o.opaque) img = img.flatten({ background: NAVY }).removeAlpha();
    await img.png({ compressionLevel: 9 }).toFile(join(assetsDir, o.file));
    console.log("sharp  ->", join(assetsDir, o.file));
  }
}

function renderWithResvg({ Resvg }) {
  for (const o of outputs) {
    const r = new Resvg(sources[o.src], {
      fitTo: { mode: "width", value: o.size },
      background: o.opaque ? NAVY : undefined,
      font: { loadSystemFonts: true, defaultFontFamily: "Georgia" },
    });
    writeFileSync(join(assetsDir, o.file), r.render().asPng());
    console.log("resvg  ->", join(assetsDir, o.file));
  }
}

const sharp = tryRequire("sharp");
if (sharp) {
  await renderWithSharp(sharp);
} else {
  const resvg = tryRequire("@resvg/resvg-js");
  if (!resvg) {
    console.error("Neither `sharp` nor `@resvg/resvg-js` could be loaded. See the header comment for how to run.");
    process.exit(1);
  }
  renderWithResvg(resvg);
}
console.log("SVG sources written to", here);
