/**
 * ============================================================================
 * STL / ZIP EXPORT (EXPORT)
 * ============================================================================
 * Turns geometries into a binary STL and bundles a set of them into one ZIP for download.
 *
 * Both formats are written by libraries we already have reason to trust rather than by hand:
 * three ships STLExporter with the exact same face-normal maths this file used to spell out, and
 * fflate writes the ZIP container — which also gets us DEFLATE, taking a default kit from ~1.0 MB
 * down to ~0.19 MB. (The previous hand-rolled ZIP could only STORE.)
 * ============================================================================
 */
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { zipSync } from "fflate";

// Binary STL (ArrayBuffer) from one or more geometries, merged into a single solid.
// STLExporter walks an Object3D, so the geometries are wrapped in throwaway meshes; their
// matrixWorld is identity, so the vertices go out exactly as geometry.js placed them.
export function buildSTL(geometries) {
  const group = new THREE.Group();
  for (const g of geometries) group.add(new THREE.Mesh(g));
  const out = new STLExporter().parse(group, { binary: true });   // DataView
  return out.buffer;
}
// The revoke is deferred, not synchronous. `a.click()` only *starts* the fetch of the blob URL;
// revoking in the same tick is a race the browser is free to lose, and when it does the download
// fails silently — no error, no file, and the bigger the kit the likelier it is. openHTML below
// already defers for the same reason.
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
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

// Download an already-built file (bytes or string), e.g. the washi template PDF or a design JSON.
// Unlike openHTML, there is nothing to preview — the file is the deliverable.
export function downloadFile(data, filename, mime = "application/octet-stream") {
  triggerDownload(new Blob([data], { type: mime }), filename);
}

// Convert parts: [{ name, geos }] to STLs and bundle into a ZIP. extraFiles: [{ name, bytes }]
// are optional extra files (settings JSON, the washi PDF, …) bundled as-is.
export function exportZip(parts, filename, extraFiles = []) {
  const files = {};
  for (const pt of parts) files[pt.name] = new Uint8Array(buildSTL(pt.geos));
  for (const f of extraFiles) files[f.name] = f.bytes;
  // STL is highly repetitive, so DEFLATE takes it to roughly a fifth. Level 6 is fflate's default
  // trade-off; the whole kit still zips in well under a second.
  downloadFile(zipSync(files), filename, "application/zip");
}
