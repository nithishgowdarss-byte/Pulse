// scripts/generate-icons.js
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const outDir = path.resolve('public/icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Generate an SVG icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141417" />
      <stop offset="100%" stop-color="#050505" />
    </linearGradient>
    <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ef4444" />
      <stop offset="50%" stop-color="#f97316" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="110" fill="url(#bgGrad)" stroke="#27272a" stroke-width="6"/>
  <circle cx="256" cy="256" r="180" fill="none" stroke="#27272a" stroke-width="3" stroke-dasharray="8 8" opacity="0.6"/>
  <!-- Pulse Wave Line -->
  <path d="M 96 256 L 160 256 L 192 180 L 232 340 L 280 140 L 320 310 L 352 256 L 416 256" 
        fill="none" 
        stroke="url(#pulseGrad)" 
        stroke-width="22" 
        stroke-linecap="round" 
        stroke-linejoin="round"
        filter="url(#glow)"/>
  <!-- Glowing Dots -->
  <circle cx="280" cy="140" r="10" fill="#f97316" filter="url(#glow)"/>
  <circle cx="232" cy="340" r="8" fill="#ef4444" filter="url(#glow)"/>
  <!-- Text Label -->
  <text x="256" y="420" text-anchor="middle" fill="#f4f4f5" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="34" letter-spacing="6">PULSE</text>
</svg>`;

fs.writeFileSync(path.join(outDir, 'icon.svg'), svgContent);

// A pure solid PNG generator without external deps (creates minimal valid uncompressed/raw PNG or SVG copy)
// For web standards, modern browsers accept SVG or valid PNGs. Let's create proper PNG buffers.
// Minimal valid 1x1 or raw PNG chunks or base64 placeholder PNGs.
// Let's create a minimal valid PNG with Pulse branding
function createPngBuffer(size, isMaskable = false) {
  const width = size;
  const height = size;
  
  // Create RGBA buffer
  const rawData = Buffer.alloc(height * (1 + width * 4));
  const padding = isMaskable ? Math.floor(size * 0.15) : Math.floor(size * 0.05);
  
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0; // Filter type None
    
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Background: Dark Zinc #0c0c0e
      let r = 12, g = 12, b = 14, a = 255;
      
      // Outer border / circle
      if (dist < (size / 2 - padding) && dist > (size / 2 - padding - 4)) {
        r = 239; g = 68; b = 68; // Red accent
      }
      
      // Pulse line drawing
      const normX = (x - padding) / (width - 2 * padding);
      if (normX >= 0.1 && normX <= 0.9) {
        let lineY = 0.5;
        if (normX > 0.25 && normX <= 0.35) lineY = 0.5 - (normX - 0.25) * 3;
        else if (normX > 0.35 && normX <= 0.5) lineY = 0.2 + (normX - 0.35) * 4.5;
        else if (normX > 0.5 && normX <= 0.65) lineY = 0.875 - (normX - 0.5) * 5;
        else if (normX > 0.65 && normX <= 0.75) lineY = 0.125 + (normX - 0.65) * 3.75;
        
        const targetPixelY = padding + lineY * (height - 2 * padding);
        const yDist = Math.abs(y - targetPixelY);
        if (yDist < size * 0.03) {
          r = 239; g = 68; b = 68; // Red
          if (normX > 0.45) { r = 249; g = 115; b = 22; } // Orange
          if (normX > 0.65) { r = 16; g = 185; b = 129; } // Emerald
        }
      }
      
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }
  
  const compressed = zlib.deflateSync(rawData);
  
  // Build PNG chunks
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const full = Buffer.concat([typeBuf, data]);
    const crc = crc32(full);
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// CRC32 implementation
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

async function run() {
  const buf192 = await createPngBuffer(192, false);
  const buf512 = await createPngBuffer(512, false);
  const buf512m = await createPngBuffer(512, true);
  
  fs.writeFileSync(path.join(outDir, 'icon-192.png'), buf192);
  fs.writeFileSync(path.join(outDir, 'icon-512.png'), buf512);
  fs.writeFileSync(path.join(outDir, 'icon-512-maskable.png'), buf512m);
  fs.writeFileSync(path.resolve('public/favicon.ico'), buf192);
  console.log('Icons created successfully');
}

run().catch(console.error);
