#!/usr/bin/env node
// Generates the Magick TLS app icons from inline SVG: the "J · Atelier crest" from the
// "MagickTLS Logo" design canvas (a stitched M under three sparkles, inside a round frame, with a
// measuring-tape banner reading MAGICKTLS). Navy #14213A, gold #D1AC66, ivory #F4EFE6, Cormorant
// Garamond — the app's own palette and typeface. The same PNGs serve every build (simulator, preview,
// production): app.json has a single icon per platform.
//
// Outputs (relative to mobile/):
//   docs/brand/icon.svg, adaptive-icon.svg, splash-icon.svg   (sources)
//   app/assets/icon.png            1024x1024, opaque navy      (iOS + fallback)
//   app/assets/adaptive-icon.png   1024x1024, transparent      (Android foreground, content inside inner 66%)
//   app/assets/splash-icon.png     1024x1024, transparent      (splash, resizeMode contain)
//   app/assets/favicon.png         48x48                       (web)
//
// Run from a directory where `sharp` (preferred) or `@resvg/resvg-js` is installed, e.g.
//   cd web && node ../mobile/docs/brand/make-icons.mjs          (web/ already has sharp)
//   cd "$(mktemp -d)" && npm i --silent sharp && node /path/to/mobile/docs/brand/make-icons.mjs
// or via npx:
//   npx -y -p sharp -c 'node /path/to/mobile/docs/brand/make-icons.mjs'
//   npx -y -p @resvg/resvg-js -c 'node /path/to/mobile/docs/brand/make-icons.mjs'
// The banner text uses the Cormorant Garamond Bold file that the app already bundles
// (mobile/app/node_modules/@expo-google-fonts/cormorant-garamond), so run `npm install` in
// mobile/app first; without it the renderer falls back to a system serif.
// Do not commit node_modules; the renderer is only needed to regenerate the PNGs.

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url)); // mobile/docs/brand
const mobileDir = resolve(here, "../..");
const assetsDir = join(mobileDir, "app", "assets");
mkdirSync(assetsDir, { recursive: true });

const NAVY = "#14213A";
const GOLD = "#D1AC66";
const SHADE = "#A8843F"; // banner wings
const IVORY = "#F4EFE6";
const FONT_FAMILY = "Cormorant Garamond";
const FONT_DIR = join(mobileDir, "app", "node_modules", "@expo-google-fonts", "cormorant-garamond", "700Bold");
const FONT_FILE = join(FONT_DIR, "CormorantGaramond_700Bold.ttf");

// The crest as drawn on the design canvas, in a 512x512 box with the ring centred at (256, 258).
const CREST = `
<circle cx="256" cy="258" r="190" fill="none" stroke="${GOLD}" stroke-width="6"/>
<circle cx="256" cy="258" r="174" fill="none" stroke="${IVORY}" stroke-width="3" stroke-dasharray="10 9" stroke-linecap="round" opacity="0.7"/>
<path d="M256 96 Q259 115 271 118 Q259 121 256 140 Q253 121 241 118 Q253 115 256 96 Z" fill="${GOLD}"/>
<path d="M214 118 Q216 130 224 132 Q216 134 214 146 Q212 134 204 132 Q212 130 214 118 Z" fill="${GOLD}"/>
<path d="M298 118 Q300 130 308 132 Q300 134 298 146 Q296 134 288 132 Q296 130 298 118 Z" fill="${GOLD}"/>
<g transform="translate(256 254) scale(0.66) translate(-256 -256)">
<polygon points="146,352 146,160 186,160 256,262 326,160 366,160 366,352 326,352 326,236 256,338 186,236 186,352" fill="${GOLD}"/>
<rect x="130" y="344" width="72" height="8" fill="${GOLD}"/>
<rect x="310" y="344" width="72" height="8" fill="${GOLD}"/>
<polyline points="166,336 166,176 256,300 346,176 346,336" fill="none" stroke="${IVORY}" stroke-width="5" stroke-dasharray="12 10" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
</g>
<polygon points="138,374 94,374 108,391 94,408 138,408" fill="${SHADE}"/>
<polygon points="374,374 418,374 404,391 418,408 374,408" fill="${SHADE}"/>
<rect x="128" y="364" width="256" height="38" fill="${GOLD}"/>
<path d="M140 364L140 370 M152 364L152 368 M164 364L164 368 M176 364L176 368 M188 364L188 370 M200 364L200 368 M212 364L212 368 M224 364L224 368 M236 364L236 370 M248 364L248 368 M260 364L260 368 M272 364L272 368 M284 364L284 370 M296 364L296 368 M308 364L308 368 M320 364L320 368 M332 364L332 370 M344 364L344 368 M356 364L356 368 M368 364L368 368" fill="none" stroke="${NAVY}" stroke-width="2"/>
<text x="256" y="394" text-anchor="middle" font-family="'${FONT_FAMILY}', Georgia, serif" font-weight="700" font-size="19" letter-spacing="6" fill="${NAVY}">MAGICKTLS</text>
`;

// Place the crest in a 1024 box, scaled about its ring centre.
const crest = (scale) =>
  `<g transform="translate(512 512) scale(${scale}) translate(-256 -258)">` + CREST + `</g>`;

const svg = (body, background) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n` +
  (background ? `  <rect width="1024" height="1024" fill="${background}"/>\n` : "") +
  body +
  "\n</svg>\n";

const sources = {
  // Full-bleed navy square; iOS applies its own mask. No transparency. Ring radius 380 of 512.
  "icon.svg": svg(crest(2), NAVY),
  // Android adaptive foreground: transparent, everything inside the inner 66% (676px) circle.
  // Outer ring edge = 193 * 1.65 = 318px < 338px.
  "adaptive-icon.svg": svg(crest(1.65), null),
  // Splash mark: transparent, shown on a navy background at imageWidth via expo-splash-screen.
  "splash-icon.svg": svg(crest(2), null),
};

for (const [name, content] of Object.entries(sources)) {
  writeFileSync(join(here, name), content);
}

// Point fontconfig (used by sharp's librsvg) at the bundled Cormorant Garamond Bold. Must happen
// before sharp is loaded, because fontconfig reads FONTCONFIG_FILE once, on first use.
function configureFonts() {
  if (!existsSync(FONT_FILE)) {
    console.warn(`Font not found at ${FONT_FILE}; the banner text will use a fallback serif.`);
    return;
  }
  const confDir = join(tmpdir(), "magicktls-icons-fontconfig");
  mkdirSync(confDir, { recursive: true });
  const conf = join(confDir, "fonts.conf");
  writeFileSync(
    conf,
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n` +
      `  <dir>${FONT_DIR}</dir>\n  <dir>/System/Library/Fonts</dir>\n  <dir>/Library/Fonts</dir>\n` +
      `  <dir>/usr/share/fonts</dir>\n  <cachedir>${join(confDir, "cache")}</cachedir>\n</fontconfig>\n`,
  );
  process.env.FONTCONFIG_FILE = conf;
}
configureFonts();

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
      font: {
        loadSystemFonts: true,
        fontFiles: existsSync(FONT_FILE) ? [FONT_FILE] : [],
        defaultFontFamily: FONT_FAMILY,
      },
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
