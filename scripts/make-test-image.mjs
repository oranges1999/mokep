// Writes fixtures/test-image.jpg (actually a PNG; browsers sniff the type) unless it already exists.
import { existsSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
const out = "fixtures/test-image.jpg";
if (existsSync(out)) { console.log("exists, keeping", out); process.exit(0); }
const W = 400, H = 300;
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const o = y * (W * 3 + 1) + 1 + x * 3;
    let r = (x / W) * 255, g = (y / H) * 255, b = 200 - (x / W) * 100;
    if (x % 50 < 2 || y % 50 < 2) { r = g = b = 255; }
    if (Math.abs(x - y * (W / H)) < 3) { r = 0; g = 0; b = 0; }
    if (x > W / 2 && y < H / 2) { r = 255; g = 220; b = 0; }
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
  }
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log("wrote", out);
