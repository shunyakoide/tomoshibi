/**
 * Turns geometries into a binary STL and bundles a set of them into one ZIP for download. Both
 * formats come from libraries rather than by hand: three's STLExporter and fflate for the ZIP,
 * whose DEFLATE takes a default kit from ~1.0 MB to ~0.19 MB.
 */
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { zipSync } from "fflate";
import type { Zippable } from "fflate";

/** One exported STL: the filename it lands in the ZIP under, and the geometries merged into it. */
export type Part = { name: string; geos: THREE.BufferGeometry[] };
/** A file bundled as-is beside the STLs (the washi PDF, the design JSON). */
export type ExtraFile = { name: string; bytes: Uint8Array };

// Binary STL (ArrayBuffer) from one or more geometries merged into a single solid. STLExporter
// walks an Object3D, so they are wrapped in throwaway meshes whose matrixWorld is identity — the
// vertices go out exactly as geometry.ts placed them.
export function buildSTL(geometries: THREE.BufferGeometry[]): ArrayBuffer {
  const group = new THREE.Group();
  for (const g of geometries) group.add(new THREE.Mesh(g));
  const out = new STLExporter().parse(group, { binary: true });   // DataView
  return out.buffer;
}
// The revoke is deferred, not synchronous: `a.click()` only STARTS the fetch of the blob URL, and
// revoking in the same tick is a race that, when lost, fails the download silently.
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Download an already-built file (bytes or string): the two template PDFs, or a design JSON.
export function downloadFile(data: BlobPart, filename: string, mime = "application/octet-stream"): void {
  triggerDownload(new Blob([data], { type: mime }), filename);
}

// Bundle already-built files ({ name: bytes }) into one ZIP and download it. Both routes ship this
// way — one download each, the washi PDF a separate file inside rather than pages spliced in.
export function zipBundle(files: Zippable, filename: string): void {
  downloadFile(zipSync(files), filename, "application/zip");
}

export function exportZip(parts: Part[], filename: string, extraFiles: ExtraFile[] = []): void {
  const files: Record<string, Uint8Array> = {};
  for (const pt of parts) files[pt.name] = new Uint8Array(buildSTL(pt.geos));
  for (const f of extraFiles) files[f.name] = f.bytes;
  zipBundle(files, filename);
}
