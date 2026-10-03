import { deflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

// A small original bitmap alphabet avoids platform fonts, network fetches and
// native image dependencies. Card bytes are deterministic on every build host.
const FONT = {
  A:'01110/10001/10001/11111/10001/10001/10001', B:'11110/10001/10001/11110/10001/10001/11110',
  C:'01111/10000/10000/10000/10000/10000/01111', D:'11110/10001/10001/10001/10001/10001/11110',
  E:'11111/10000/10000/11110/10000/10000/11111', F:'11111/10000/10000/11110/10000/10000/10000',
  G:'01111/10000/10000/10111/10001/10001/01111', H:'10001/10001/10001/11111/10001/10001/10001',
  I:'11111/00100/00100/00100/00100/00100/11111', J:'00111/00010/00010/00010/10010/10010/01100',
  K:'10001/10010/10100/11000/10100/10010/10001', L:'10000/10000/10000/10000/10000/10000/11111',
  M:'10001/11011/10101/10101/10001/10001/10001', N:'10001/11001/10101/10011/10001/10001/10001',
  O:'01110/10001/10001/10001/10001/10001/01110', P:'11110/10001/10001/11110/10000/10000/10000',
  Q:'01110/10001/10001/10001/10101/10010/01101', R:'11110/10001/10001/11110/10100/10010/10001',
  S:'01111/10000/10000/01110/00001/00001/11110', T:'11111/00100/00100/00100/00100/00100/00100',
  U:'10001/10001/10001/10001/10001/10001/01110', V:'10001/10001/10001/10001/10001/01010/00100',
  W:'10001/10001/10001/10101/10101/11011/10001', X:'10001/10001/01010/00100/01010/10001/10001',
  Y:'10001/10001/01010/00100/00100/00100/00100', Z:'11111/00001/00010/00100/01000/10000/11111',
  '.':'00000/00000/00000/00000/00000/00110/00110', '-':'00000/00000/00000/11111/00000/00000/00000',
  '?':'01110/10001/00001/00010/00100/00000/00100', ':':'00000/00100/00100/00000/00100/00100/00000',
  '0':'01110/10001/10011/10101/11001/10001/01110', '1':'00100/01100/00100/00100/00100/00100/01110',
  '2':'01110/10001/00001/00010/00100/01000/11111', '3':'11110/00001/00001/01110/00001/00001/11110',
  '4':'00010/00110/01010/10010/11111/00010/00010', '5':'11111/10000/10000/11110/00001/00001/11110',
  '6':'01110/10000/10000/11110/10001/10001/01110', '7':'11111/00001/00010/00100/01000/01000/01000',
  '8':'01110/10001/10001/01110/10001/10001/01110', '9':'01110/10001/10001/01111/00001/00001/01110',
};
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const payload = Buffer.concat([Buffer.from(type), bytes]), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(payload));
  return Buffer.concat([length, payload, crc]);
}
export async function socialCard(site, templateRoot) {
  const layout = JSON.parse(await readFile(new URL('design/card.json', templateRoot)));
  const tokens = await readFile(new URL('assets/tokens.css', templateRoot), 'utf8');
  function color(role) {
    const match = tokens.match(new RegExp('--' + role + ':\\s*(#[0-9a-fA-F]{6})'));
    if (!match) throw new Error(`Card color role missing: ${role}`);
    return [1, 3, 5].map(offset => parseInt(match[1].slice(offset, offset + 2), 16));
  }
  const paper = color(layout.paperRole), ink = color(layout.inkRole), accent = color(layout.accentRole);
  const pixels = Buffer.alloc(layout.width * layout.height * 3);
  for (let offset = 0; offset < pixels.length; offset += 3) pixels.set(paper, offset);
  function rectangle(x, y, width, height, rgb) {
    for (let row = y; row < Math.min(layout.height, y + height); row++) for (let col = x; col < Math.min(layout.width, x + width); col++) pixels.set(rgb, (row * layout.width + col) * 3);
  }
  function text(value, x, y, scale, rgb) {
    for (const character of value.toUpperCase()) {
      if (character !== ' ') (FONT[character] || FONT['?']).split('/').forEach((row, dy) => [...row].forEach((cell, dx) => { if (cell === '1') rectangle(x + dx * scale, y + dy * scale, scale, scale, rgb); }));
      x += 6 * scale;
    }
  }
  text('RAGBAZ', layout.gutter, layout.brandY, layout.brandScale, accent);
  const titleScale = Math.min(layout.titleScale, Math.floor((layout.width - 2 * layout.gutter) / (6 * site.name.length)));
  text(site.name, layout.gutter, layout.titleY, Math.max(1, titleScale), ink);
  const max = Math.floor((layout.width - 2 * layout.gutter) / (6 * layout.bodyScale));
  const words = site.tagline.split(/\s+/); let line = '', row = 0;
  for (const word of words) {
    if ((line + ' ' + word).trim().length > max && line) { text(line, layout.gutter, layout.taglineY + row++ * layout.lineHeight, layout.bodyScale, ink); line = word; }
    else line = (line + ' ' + word).trim();
  }
  text(line, layout.gutter, layout.taglineY + row * layout.lineHeight, layout.bodyScale, ink);
  rectangle(layout.gutter, layout.footerY - layout.lineHeight, layout.width - 2 * layout.gutter, layout.ruleHeight, accent);
  text(new URL(site.origin).hostname, layout.gutter, layout.footerY, layout.bodyScale, accent);
  const scanlines = Buffer.alloc((layout.width * 3 + 1) * layout.height);
  for (let y = 0; y < layout.height; y++) pixels.copy(scanlines, y * (layout.width * 3 + 1) + 1, y * layout.width * 3, (y + 1) * layout.width * 3);
  const header = Buffer.alloc(13); header.writeUInt32BE(layout.width); header.writeUInt32BE(layout.height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}
