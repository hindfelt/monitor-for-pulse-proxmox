// Generates the app icons (indigo square + white pulse line) with no dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const LINE = [[10, 34], [21, 34], [26, 22], [34, 44], [40, 30], [43, 34], [54, 34]]; // on a 64-unit grid

const seg = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** scale: how much of the canvas the 64-grid occupies (Android foregrounds need ~0.6 to sit in the safe zone). */
function render(size, { background, scale = 1, rounded = false }) {
  const ss = 3, out = Buffer.alloc(size * size * 4);
  const unit = (size * scale) / 64, off = (size - size * scale) / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let bg = 0, line = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const u = (x + (sx + 0.5) / ss - off) / unit, v = (y + (sy + 0.5) / ss - off) / unit;
      const gx = (x + (sx + 0.5) / ss) / (size / 64), gy = (y + (sy + 0.5) / ss) / (size / 64);
      const r = 14, cx = Math.min(Math.max(gx, r), 64 - r), cy = Math.min(Math.max(gy, r), 64 - r);
      if (!rounded || Math.hypot(gx - cx, gy - cy) <= r) bg++;
      let d = Infinity;
      for (let i = 0; i < LINE.length - 1; i++) d = Math.min(d, seg(u, v, LINE[i], LINE[i + 1]));
      if (d <= 2.25) line++;
    }
    const n = ss * ss, o = (y * size + x) * 4, l = line / n;
    if (background) {
      const a = bg / n;
      out[o] = Math.round(0x4f + (255 - 0x4f) * l); out[o + 1] = Math.round(0x46 + (255 - 0x46) * l); out[o + 2] = Math.round(0xe5 + (255 - 0xe5) * l);
      out[o + 3] = Math.round(255 * Math.max(a, l));
    } else {
      out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = Math.round(255 * l);
    }
  }
  return png(size, out);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) { let c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('assets/icon.png', render(1024, { background: true }));               // iOS masks corners itself
writeFileSync('assets/android-icon-foreground.png', render(1024, { background: false, scale: 0.62 }));
writeFileSync('assets/android-icon-monochrome.png', render(1024, { background: false, scale: 0.62 }));
writeFileSync('assets/splash-icon.png', render(512, { background: true, rounded: true }));
console.log('icons written');
