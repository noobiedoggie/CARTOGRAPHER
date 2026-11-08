#!/usr/bin/env node
/**
 * Post-sync patch for the generated Android project (runs automatically as
 * the `capacitor:sync:after` npm hook, so `npx cap add android` and
 * `npx cap sync` both apply it). Idempotent - safe to run many times.
 *
 *  - locks the activity to portrait
 *  - parchment launch theme / splash (no Capacitor logo)
 *  - generates the launcher icons (compass rose on parchment) as PNGs with a
 *    tiny built-in rasterizer + PNG encoder - no image tools needed
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.log('[patch-android] no android project yet - skipping');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 1. Manifest: portrait lock
// ---------------------------------------------------------------------------
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android:screenOrientation')) {
  manifest = manifest.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="portrait"');
  fs.writeFileSync(manifestPath, manifest);
}

// ---------------------------------------------------------------------------
// 2. Colours, launch theme and splash
// ---------------------------------------------------------------------------
const PARCHMENT = '#ECDFBF';
const DESK = '#3A2A1E';
fs.writeFileSync(
  path.join(res, 'values', 'cartographer_colors.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="cartographer_desk">${DESK}</color>
    <color name="cartographer_parchment">${PARCHMENT}</color>
</resources>
`,
);
const bgPath = path.join(res, 'values', 'ic_launcher_background.xml');
fs.writeFileSync(
  bgPath,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${PARCHMENT}</color>
</resources>
`,
);

// Replace the stock splash PNGs with a layer-list (desk colour + compass).
for (const dir of fs.readdirSync(res)) {
  if (!dir.startsWith('drawable')) continue;
  const f = path.join(res, dir, 'splash.png');
  if (fs.existsSync(f)) fs.rmSync(f);
}
fs.writeFileSync(
  path.join(res, 'drawable', 'splash.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/cartographer_desk" />
    <item android:gravity="center" android:width="160dp" android:height="160dp" android:drawable="@mipmap/ic_launcher_round" />
</layer-list>
`,
);

const stylesPath = path.join(res, 'values', 'styles.xml');
let styles = fs.readFileSync(stylesPath, 'utf8');
if (!styles.includes('windowSplashScreenBackground')) {
  styles = styles.replace(
    /<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">[\s\S]*?<\/style>/,
    `<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
        <item name="windowSplashScreenBackground">@color/cartographer_desk</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>`,
  );
  styles = styles.replace(
    /(<style name="AppTheme.NoActionBar"[^>]*>)/,
    `$1
        <item name="android:windowBackground">@color/cartographer_desk</item>`,
  );
  fs.writeFileSync(stylesPath, styles);
}

// ---------------------------------------------------------------------------
// 3. Launcher icons
// ---------------------------------------------------------------------------
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const INKC = hex('#1D1915');
const RED = hex('#A3302A');
const SEPIA = hex('#6B4A2B');
const PAPER = hex(PARCHMENT);

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Compass rose layers in unit space centred at (0,0); `s` scales the art. */
function roseLayers(s) {
  const L = 0.29 * s;
  const Wd = 0.06 * s;
  const D = 0.16 * s;
  const Dw = 0.035 * s;
  const ring = (r, wdt) => (x, y) => Math.abs(Math.hypot(x, y) - r) <= wdt / 2;
  return [
    { color: SEPIA, test: ring(0.235 * s, 0.008 * s) },
    { color: INKC, test: ring(0.27 * s, 0.022 * s) },
    // diagonal points
    ...[45, 135, 225, 315].map((deg) => {
      const a = (deg * Math.PI) / 180;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const pts = [
        [c * D, sn * D],
        [-sn * Dw, c * Dw],
        [sn * Dw, -c * Dw],
      ];
      return { color: SEPIA, test: (x, y) => inPoly(x, y, pts) };
    }),
    { color: RED, test: (x, y) => inPoly(x, y, [[-L, 0], [0, -Wd], [L, 0], [0, Wd]]) },
    { color: INKC, test: (x, y) => inPoly(x, y, [[0, -L * 1.08], [Wd, 0], [0, L * 1.08], [-Wd, 0]]) },
    { color: PAPER, test: (x, y) => Math.hypot(x, y) <= 0.03 * s },
  ];
}

/**
 * Rasterise an icon. kind: 'foreground' (transparent, adaptive safe zone),
 * 'square' (rounded parchment tile) or 'round' (parchment disc).
 */
function renderIcon(size, kind) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4; // supersampling
  const artScale = kind === 'foreground' ? 1 : 1.45;
  const layers = roseLayers(artScale);
  const bgTest =
    kind === 'round'
      ? (x, y) => Math.hypot(x, y) <= 0.49
      : kind === 'square'
        ? (x, y) => {
            const r = 0.12;
            const ax = Math.max(Math.abs(x) - (0.47 - r), 0);
            const ay = Math.max(Math.abs(y) - (0.47 - r), 0);
            return Math.hypot(ax, ay) <= r;
          }
        : null;
  const borderTest =
    kind === 'round'
      ? (x, y) => Math.hypot(x, y) > 0.455 && Math.hypot(x, y) <= 0.49
      : kind === 'square'
        ? (x, y) => {
            const r = 0.12;
            const ax = Math.max(Math.abs(x) - (0.47 - r), 0);
            const ay = Math.max(Math.abs(y) - (0.47 - r), 0);
            const d = Math.hypot(ax, ay);
            const inner = Math.max(Math.abs(x), Math.abs(y)) > 0.435 || d > r - 0.035;
            return d <= r && inner;
          }
        : null;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const grain = (rnd() - 0.5) * 14;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size - 0.5;
          const y = (py + (sy + 0.5) / SS) / size - 0.5;
          let col = null;
          if (bgTest && bgTest(x, y)) col = [PAPER[0] + grain, PAPER[1] + grain, PAPER[2] + grain * 0.8];
          if (borderTest && borderTest(x, y)) col = INKC;
          for (const L of layers) if (L.test(x, y)) col = L.color;
          if (col) {
            r += col[0];
            g += col[1];
            b += col[2];
            a += 1;
          }
        }
      }
      const o = (py * size + px) * 4;
      if (a > 0) {
        buf[o] = Math.max(0, Math.min(255, r / a));
        buf[o + 1] = Math.max(0, Math.min(255, g / a));
        buf[o + 2] = Math.max(0, Math.min(255, b / a));
        buf[o + 3] = Math.round((a / (SS * SS)) * 255);
      }
    }
  }
  return encodePNG(size, size, buf);
}

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, m] of Object.entries(DENSITIES)) {
  const dir = path.join(res, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), renderIcon(Math.round(48 * m), 'square'));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), renderIcon(Math.round(48 * m), 'round'));
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), renderIcon(Math.round(108 * m), 'foreground'));
}

console.log('[patch-android] portrait lock, parchment splash and compass icons applied');
