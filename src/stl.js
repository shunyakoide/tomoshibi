/**
 * ============================================================================
 * STL / ZIP EXPORT (EXPORT)
 * ============================================================================
 * Generates a binary STL (ArrayBuffer) from a BufferGeometry, and bundles multiple STLs into a
 * single ZIP (uncompressed STORE) for download. To avoid adding dependencies, the ZIP is a
 * hand-rolled implementation (with CRC32).
 * ============================================================================
 */
import * as THREE from "three";

// Generate a binary STL as an ArrayBuffer (used for both download and ZIP)
export function buildSTL(geometries) {
  const geos = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  let tri = 0;
  for (const g of geos) tri += g.attributes.position.count / 3;
  const buf = new ArrayBuffer(84 + tri * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tri, true);
  let off = 84;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const cb = new THREE.Vector3(), ab = new THREE.Vector3();
  for (const g of geos) {
    const pos = g.attributes.position;
    for (let f = 0; f < pos.count; f += 3) {
      for (let i = 0; i < 3; i++) v[i].fromBufferAttribute(pos, f + i);
      cb.subVectors(v[2], v[1]); ab.subVectors(v[0], v[1]); cb.cross(ab).normalize();
      dv.setFloat32(off, cb.x, true); dv.setFloat32(off + 4, cb.y, true); dv.setFloat32(off + 8, cb.z, true);
      off += 12;
      for (const q of v) {
        dv.setFloat32(off, q.x, true); dv.setFloat32(off + 4, q.y, true); dv.setFloat32(off + 8, q.z, true);
        off += 12;
      }
      dv.setUint16(off, 0, true); off += 2;
    }
  }
  return buf;
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Open the generated HTML (paper template) in a new tab. Print with Ctrl/⌘+P in that tab.
// If the popup is blocked, fall back to downloading it as a file.
export function openHTML(html, filename) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) triggerDownload(blob, filename);
  setTimeout(() => URL.revokeObjectURL(url), 60000); // don't revoke until the new tab has finished loading
}

// Download an already-built file (bytes or string), e.g. the washi template PDF. Unlike openHTML,
// there is nothing to preview — the file is the deliverable.
export function downloadFile(data, filename, mime = "application/octet-stream") {
  triggerDownload(new Blob([data], { type: mime }), filename);
}

// ---- Minimal ZIP (uncompressed STORE + CRC32). Bundle multiple STLs into one file without adding dependencies ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeZip(files) { // files: [{ name, bytes: Uint8Array }]
  const enc = new TextEncoder();
  const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.bytes, crc = crc32(data);
    const lh = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    chunks.push(lh, name, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset)]), name);
    offset += lh.length + name.length + data.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) { chunks.push(c); cdSize += c.length; }
  chunks.push(new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(cdStart), ...u16(0)]));
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}
// Convert parts: [{ name, geos }] to STLs and bundle into a ZIP. extraFiles: [{ name, bytes }]
// are optional extra files (settings JSON, etc.) bundled as-is, i.e. non-STL (optional,
// backward-compatible).
export function exportZip(parts, filename, extraFiles = []) {
  const files = parts.map((pt) => ({ name: pt.name, bytes: new Uint8Array(buildSTL(pt.geos)) }));
  triggerDownload(new Blob([makeZip([...files, ...extraFiles])], { type: "application/zip" }), filename);
}
