// PNG tEXt keeps the artwork credit with downloaded posters without changing their layout.
const data = new TextEncoder().encode('Copyright\0Twemoji graphics by Twitter, Inc. and contributors, used and adapted under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source: https://github.com/jdecked/twemoji/tree/v17.0.2')
const chunk = new Uint8Array(data.length + 12)
const view = new DataView(chunk.buffer)
view.setUint32(0, data.length)
chunk.set([116, 69, 88, 116], 4) // tEXt
chunk.set(data, 8)
let crc = 0xffffffff
for (const byte of chunk.subarray(4, -4)) {
  crc ^= byte
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
}
view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0)

export function creditPoster(png: Blob) {
  // Insert immediately before the final, empty IEND chunk.
  return new Blob([png.slice(0, -12), chunk, png.slice(-12)], { type: 'image/png' })
}
