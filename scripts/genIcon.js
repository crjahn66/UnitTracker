const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const W = 1024, H = 1024;
const rgb = new Uint8Array(W * H * 3);

const set = (x, y, r, g, b) => {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  rgb[i] = r; rgb[i+1] = g; rgb[i+2] = b;
};

// Background #0d1117
for (let i = 0; i < rgb.length; i += 3) { rgb[i] = 13; rgb[i+1] = 17; rgb[i+2] = 23; }

const fillCircle = (cx, cy, r, R, G, B) => {
  for (let y = Math.max(0, cy-r); y <= Math.min(H-1, cy+r); y++)
    for (let x = Math.max(0, cx-r); x <= Math.min(W-1, cx+r); x++)
      if ((x-cx)**2 + (y-cy)**2 <= r*r) set(x, y, R, G, B);
};

const thickLine = (x0, y0, x1, y1, t, R, G, B) => {
  const dx = x1-x0, dy = y1-y0, len = Math.hypot(dx, dy);
  const nx = -dy/len, ny = dx/len, half = t/2;
  for (let s = 0, steps = Math.ceil(len*2); s <= steps; s++) {
    const f = s/steps, cx = x0+dx*f, cy = y0+dy*f;
    for (let w = -half; w <= half; w++)
      set(Math.round(cx+nx*w), Math.round(cy+ny*w), R, G, B);
  }
};

// Blue outer ring then navy fill
fillCircle(512, 512, 458, 31, 111, 235);   // #1F6FEB
fillCircle(512, 512, 422, 22, 42, 66);     // #162A42 interior

// White checkmark with round caps
const T = 62;
thickLine(220, 500, 415, 700, T, 255, 255, 255);
thickLine(415, 700, 805, 315, T, 255, 255, 255);
fillCircle(220, 500, T/2, 255, 255, 255);
fillCircle(415, 700, T/2, 255, 255, 255);
fillCircle(805, 315, T/2, 255, 255, 255);

// Build raw scanlines (filter byte + RGB)
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (W*3+1)] = 0;
  for (let x = 0; x < W; x++) {
    const s = (y*W+x)*3, d = y*(W*3+1)+1+x*3;
    raw[d] = rgb[s]; raw[d+1] = rgb[s+1]; raw[d+2] = rgb[s+2];
  }
}

// CRC32
const tbl = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); tbl[n]=c; }
const crc32 = buf => { let c=0xFFFFFFFF; for (const b of buf) c=tbl[(c^b)&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };

const chunk = (type, data) => {
  const tb = Buffer.from(type), lb = Buffer.alloc(4), cb = Buffer.alloc(4);
  lb.writeUInt32BE(data.length); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([lb, tb, data, cb]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8]=8; ihdr[9]=2; // 8-bit RGB

const png = Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'assets');
fs.writeFileSync(path.join(out, 'icon.png'), png);
fs.writeFileSync(path.join(out, 'adaptive-icon.png'), png);
console.log(`Icon written (${(png.length/1024).toFixed(1)} KB)`);
