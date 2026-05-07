#!/usr/bin/env node
// Generates PWA icons from the BoggleSmurf logo SVG.
// Requires sharp (pnpm add -D sharp).
import sharp from 'sharp'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dir, '..', 'public')

// Clean, filter-free icon SVG — works cleanly at small sizes.
// The lightning-bolt is the BoggleSmurf logo path, centered on a dark rounded square.
function makeSvg(size) {
  const pad = size * 0.1
  const inner = size - pad * 2
  // Original path viewBox is 48×46; scale to fit inner area
  const scale = inner / 48
  const tx = pad + (inner - 48 * scale) / 2
  const ty = pad + (inner - 46 * scale) / 2
  const r = size * 0.18
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#0f172a"/>
  <g transform="translate(${tx}, ${ty}) scale(${scale})">
    <path fill="#863bff" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"/>
    <path fill="#c084fc" opacity="0.35" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h14c.92 0 1.456 1.04.92 1.788l-5 7c-.8 1.1 0 2.6 1.3 2.6h8c.943 0 1.473 1.088.89 1.832L25.947 44.94z"/>
  </g>
</svg>`
}

async function generatePng(size, filename) {
  const svg = Buffer.from(makeSvg(size))
  await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toFile(join(publicDir, filename))
  console.log(`✓ ${filename} (${size}×${size})`)
}

// Build multi-size ICO from a 48×48 PNG (ICO is just concatenated PNG frames)
async function generateIco() {
  const sizes = [16, 32, 48]
  const pngBuffers = await Promise.all(
    sizes.map(s => sharp(Buffer.from(makeSvg(s))).resize(s, s).png().toBuffer()),
  )

  // ICO file format: ICONDIR + ICONDIRENTRYs + image data
  const numImages = sizes.length
  const dirSize = 6 + numImages * 16
  let dataOffset = dirSize

  const entries = []
  for (let i = 0; i < numImages; i++) {
    const size = sizes[i]
    const buf = pngBuffers[i]
    entries.push({ size, buf, offset: dataOffset })
    dataOffset += buf.length
  }

  const totalSize = dataOffset
  const ico = Buffer.alloc(totalSize)

  // ICONDIR header
  ico.writeUInt16LE(0, 0)       // reserved
  ico.writeUInt16LE(1, 2)       // type: 1 = ICO
  ico.writeUInt16LE(numImages, 4)

  // ICONDIRENTRY per image
  for (let i = 0; i < numImages; i++) {
    const { size, buf, offset } = entries[i]
    const base = 6 + i * 16
    ico.writeUInt8(size === 256 ? 0 : size, base)      // width (0 = 256)
    ico.writeUInt8(size === 256 ? 0 : size, base + 1)  // height
    ico.writeUInt8(0, base + 2)   // color count
    ico.writeUInt8(0, base + 3)   // reserved
    ico.writeUInt16LE(1, base + 4) // planes
    ico.writeUInt16LE(32, base + 6) // bit count
    ico.writeUInt32LE(buf.length, base + 8)  // size of image data
    ico.writeUInt32LE(offset, base + 12)     // offset of image data
  }

  // Image data
  for (const { buf, offset } of entries) {
    buf.copy(ico, offset)
  }

  writeFileSync(join(publicDir, 'favicon.ico'), ico)
  console.log('✓ favicon.ico (16×16, 32×32, 48×48)')
}

await generatePng(192, 'pwa-192.png')
await generatePng(512, 'pwa-512.png')
await generatePng(180, 'apple-touch-icon.png')
await generateIco()
console.log('Done.')
