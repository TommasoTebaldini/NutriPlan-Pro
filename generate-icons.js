#!/usr/bin/env node
// Run: node generate-icons.js
// Generates all required PWA icon sizes as PNG files (no external dependencies).
// Same technique as Diet-Plan-Pro-app-claude/generate-icons.js (raw PNG encoding,
// no sharp/canvas): a solid rounded-square background with a bold "N" mark.

import zlib from 'zlib'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

// Brand color from favicon.svg: #0d9488 (teal)
const BG_R = 13, BG_G = 148, BG_B = 136
const FG_R = 255, FG_G = 255, FG_B = 255

function uint32BE(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n >>> 0)
  return b
}

function crc32(buf) {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii')
  const combined = Buffer.concat([tb, data])
  return Buffer.concat([uint32BE(data.length), combined, uint32BE(crc32(combined))])
}

// Returns true if (x,y) is part of a bold "N" glyph centered in the icon.
function isN(x, y, size) {
  const pad = size * 0.26
  const x0 = pad, x1 = size - pad
  const y0 = pad, y1 = size - pad
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const barW = (x1 - x0) * 0.26

  // Left vertical stroke
  if (x <= x0 + barW) return true
  // Right vertical stroke
  if (x >= x1 - barW) return true

  // Diagonal stroke: thick line from top-left of left bar to bottom-right of right bar
  const ax = x0 + barW / 2, ay = y0
  const bx = x1 - barW / 2, by = y1
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = ((x - ax) * dx + (y - ay) * dy) / len2
  if (t < 0 || t > 1) return false
  const projX = ax + t * dx, projY = ay + t * dy
  const dist = Math.hypot(x - projX, y - projY)
  return dist <= barW * 0.62
}

function isRounded(x, y, size) {
  const r = size * 0.22
  const corners = [
    [r, r], [size - r, r], [r, size - r], [size - r, size - r],
  ]
  for (const [cx, cy] of corners) {
    const inCornerBoxX = (cx === r) ? x < r : x > size - r
    const inCornerBoxY = (cy === r) ? y < r : y > size - r
    if (inCornerBoxX && inCornerBoxY) {
      return Math.hypot(x - cx, y - cy) <= r
    }
  }
  return true
}

function createIconPNG(size) {
  const raw = Buffer.alloc(size * (1 + size * 4)) // RGBA

  for (let y = 0; y < size; y++) {
    const rowOff = y * (1 + size * 4)
    raw[rowOff] = 0 // filter type None
    for (let x = 0; x < size; x++) {
      const off = rowOff + 1 + x * 4
      const rounded = isRounded(x, y, size)
      const n = rounded && isN(x, y, size)

      if (!rounded) {
        raw[off] = 0; raw[off + 1] = 0; raw[off + 2] = 0; raw[off + 3] = 0
      } else if (n) {
        raw[off] = FG_R; raw[off + 1] = FG_G; raw[off + 2] = FG_B; raw[off + 3] = 255
      } else {
        raw[off] = BG_R; raw[off + 1] = BG_G; raw[off + 2] = BG_B; raw[off + 3] = 255
      }
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // RGBA
  // bytes 10-12 are 0 (compression, filter, interlace)

  const idat = zlib.deflateSync(raw)
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const iconsDir = path.join(__dirname, 'icons')
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true })

SIZES.forEach(size => {
  const buf = createIconPNG(size)
  fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.png`), buf)
  console.log(`✓ icon-${size}x${size}.png`)
})
console.log('\nAll icons generated in icons/')
