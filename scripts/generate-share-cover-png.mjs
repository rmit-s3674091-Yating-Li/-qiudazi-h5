import fs from "node:fs";
import zlib from "node:zlib";

const width = 1200;
const height = 1200;
const pixels = Buffer.alloc(width * height * 4);

const hex = (value) => {
  const v = value.replace("#", "");
  return [Number.parseInt(v.slice(0, 2), 16), Number.parseInt(v.slice(2, 4), 16), Number.parseInt(v.slice(4, 6), 16), 255];
};
const setPixel = (x, y, color) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = color[3] ?? 255;
};
const fillRect = (x, y, w, h, color) => {
  for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) setPixel(xx, yy, color);
};
const circle = (cx, cy, r, color) => {
  for (let y = -r; y <= r; y += 1) {
    const span = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
    for (let x = -span; x <= span; x += 1) setPixel(cx + x, cy + y, color);
  }
};
const line = (x0, y0, x1, y1, thickness, color) => {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, Math.max(1, Math.floor(thickness / 2)), color);
  }
};
const ring = (cx, cy, rx, ry, thickness, color, gapStart = null, gapEnd = null) => {
  for (let deg = 0; deg < 360; deg += 0.35) {
    if (gapStart !== null && deg >= gapStart && deg <= gapEnd) continue;
    const rad = deg * Math.PI / 180;
    circle(cx + Math.cos(rad) * rx, cy + Math.sin(rad) * ry, Math.max(1, Math.floor(thickness / 2)), color);
  }
};
const roundedRect = (x, y, w, h, r, color) => {
  fillRect(x + r, y, w - 2 * r, h, color);
  fillRect(x, y + r, w, h - 2 * r, color);
  circle(x + r, y + r, r, color); circle(x + w - r, y + r, r, color);
  circle(x + r, y + h - r, r, color); circle(x + w - r, y + h - r, r, color);
};
const racket = (cx, cy, angle, stroke, fill) => {
  const c = Math.cos(angle), s = Math.sin(angle);
  const p = (x, y) => [cx + x * c - y * s, cy + x * s + y * c];
  // Filled racket head keeps the raster thumbnail readable at small sizes.
  for (let ry = -190; ry <= 190; ry += 1) {
    const normalized = 1 - (ry * ry) / (190 * 190);
    const span = normalized > 0 ? Math.sqrt(normalized) * 135 : 0;
    for (let rx = -span; rx <= span; rx += 1) {
      const [x, y] = p(rx, ry);
      setPixel(x, y, fill);
    }
  }
  for (let deg = 0; deg < 360; deg += 0.5) {
    const rad = deg * Math.PI / 180;
    const [x, y] = p(Math.cos(rad) * 135, Math.sin(rad) * 190);
    circle(x, y, 12, stroke);
  }
  const [hx0, hy0] = p(0, 175); const [hx1, hy1] = p(0, 430);
  line(hx0, hy0, hx1, hy1, 30, stroke);
  for (const gx of [-80, -40, 0, 40, 80]) {
    const [x0, y0] = p(gx, -145); const [x1, y1] = p(gx, 145); line(x0, y0, x1, y1, 5, stroke);
  }
  for (const gy of [-110, -55, 0, 55, 110]) {
    const [x0, y0] = p(-105, gy); const [x1, y1] = p(105, gy); line(x0, y0, x1, y1, 5, stroke);
  }
};

const cream = hex("#f8f2df");
const cream2 = hex("#ead8b7");
const sage = hex("#8e9b7a");
const offWhite = hex("#f6f4ec");
const green = hex("#174b2b");
const tan = hex("#b89d71");
const yellow = hex("#d8e532");

// Warm cream background with a subtle lower-court band.
fillRect(0, 0, width, height, cream);
for (let y = 760; y < height; y += 1) {
  const t = (y - 760) / 440;
  const mix = cream.map((v, i) => Math.round(v * (1 - t * 0.35) + cream2[i] * t * 0.35));
  mix[3] = 255;
  fillRect(0, y, width, 1, mix);
}

// Canonical sage square + open C mark.
roundedRect(92, 92, 132, 132, 30, sage);
ring(158, 158, 39, 39, 13, offWhite, 300, 350);
line(187, 130, 194, 139, 12, offWhite);

// Simple brand wordmark bars: intentionally decorative, while metadata carries canonical Chinese title.
fillRect(92, 286, 420, 18, green);
fillRect(92, 322, 330, 12, green);
fillRect(92, 358, 250, 12, green);

racket(720, 735, 0.34, tan, hex("#f6edd9"));
racket(875, 675, -0.42, green, cream);

circle(310, 855, 60, yellow);
ring(310, 855, 48, 48, 7, offWhite, 75, 250);
circle(985, 840, 78, yellow);
ring(985, 840, 62, 62, 8, offWhite, 80, 255);

// PNG encoding with Node built-ins only, so npm ci/package-lock stay untouched.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const name = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); name.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const scanlines = Buffer.alloc(height * (1 + width * 4));
for (let y = 0; y < height; y += 1) {
  const row = y * (1 + width * 4);
  scanlines[row] = 0;
  pixels.copy(scanlines, row + 1, y * width * 4, (y + 1) * width * 4);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/share-cover.png", png);
console.log(`generated public/share-cover.png (${width}x${height}, ${png.length} bytes)`);
