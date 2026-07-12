/**
 * ============================================================================
 * 2D断面描画 (SECTION VIEW)
 * ============================================================================
 * 羽根板の確定断面(輪郭・爪・首・竹ひご溝・肉抜き)を Canvas 2D で描く。
 * 中心軸を左、外縁を右に取り、注釈付きで形状を分かりやすく提示する。
 * geometry.js の断面関数(ribOutline2D / lightenHoles2D / outerR …)を共有。
 * ============================================================================
 */
import { cutT, cutY, outerR, ribOutline2D, lightenHoles2D } from "./geometry.js";

// キャンバスへ羽根板断面を描画(DPR対応・自動フィット)。
export function drawSection(cv, p) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = cv.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  cv.width = rect.width * dpr; cv.height = rect.height * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);
  const C = { rib: "#cdbb96", ribLine: "#7a6a48", neck: "#e79b6a", groove: "#b98a4e",
    axis: "#b9b0a0", grid: "#e6e0d5", ink: "#242019", muted: "#8f8676", accent: "#e8590c" };

  const h = p.height, tl = p.tabLen, c = cutT(p);
  const { pts, grooves, outerX, Ri, td } = ribOutline2D(p);
  const maxX = Math.max(...Array.from({ length: 121 }, (_, i) => outerR(p, i / 120)));
  const pad = 60, sc = Math.min((W - pad * 2) / (maxX * 1.75), (H - pad * 2) / (h + 2 * tl));
  const ax = pad + 20, baseY = H - pad;
  const Y = (y) => baseY - (y + tl) * sc, X = (x) => ax + x * sc;
  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };

  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  for (let r = 0; r <= maxX; r += 20) line(X(r), Y(h + tl), X(r), Y(-tl));
  ctx.strokeStyle = C.axis; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5;
  line(ax, Y(-tl) - 8, ax, Y(h + tl) + 8); ctx.setLineDash([]);
  ctx.fillStyle = C.muted; ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.save(); ctx.translate(ax - 10, (Y(0) + Y(h)) / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center"; ctx.fillText("中心軸", 0, 0); ctx.restore();

  const outline = new Path2D();
  pts.forEach((q, i) => { const sx = X(q[0]), sy = Y(q[1]); i ? outline.lineTo(sx, sy) : outline.moveTo(sx, sy); });
  outline.closePath();
  const lh = p.lighten ? lightenHoles2D(p) : { holes: [], bandW: 11, spineW: Math.max(9, td + 3) };
  const holePaths = lh.holes.map((hole) => { const hp = new Path2D();
    hole.forEach((q, i) => { const sx = X(q[0]), sy = Y(q[1]); i ? hp.lineTo(sx, sy) : hp.moveTo(sx, sy); }); hp.closePath(); return hp; });
  const fill = new Path2D(); fill.addPath(outline); holePaths.forEach((hp) => fill.addPath(hp));
  ctx.fillStyle = C.rib; ctx.fill(fill, "evenodd");

  // 外縁の帯(溝=連続) と 内縁の芯 を色分け
  ctx.save(); ctx.clip(fill, "evenodd");
  const oS = (y) => outerR(p, Math.min(y, h) / h); // 滑らかな外周(帯の内側=穴と揃える)
  const band = new Path2D(); let f = true;
  for (let y = 0; y <= h; y += 2) { const xo = outerX(Math.min(y, h)); f ? (band.moveTo(X(xo), Y(y)), f = false) : band.lineTo(X(xo), Y(y)); }
  for (let y = h; y >= 0; y -= 2) band.lineTo(X(oS(y) - lh.bandW), Y(y));
  band.closePath();
  ctx.fillStyle = C.groove; ctx.globalAlpha = 0.20; ctx.fill(band);
  ctx.fillStyle = C.accent; ctx.globalAlpha = 0.15;
  ctx.fillRect(X(Ri), Y(h + tl), X(Ri + lh.spineW) - X(Ri), Y(-tl) - Y(h + tl));
  ctx.globalAlpha = 1; ctx.restore();

  ctx.strokeStyle = C.groove; ctx.lineWidth = 2;
  for (const g of grooves) { const rr = outerR(p, g / h); ctx.beginPath(); ctx.arc(X(rr), Y(g), (p.higoD / 2 + 0.15) * sc, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
  ctx.strokeStyle = C.ribLine; ctx.lineWidth = 2; ctx.stroke(outline);
  ctx.lineWidth = 1.4; holePaths.forEach((hp) => ctx.stroke(hp));

  // 爪(上下とも Ri の内側で同じ位置)
  ctx.fillStyle = C.accent;
  const tab = (yy) => { const P = new Path2D(); P.moveTo(X(Ri), Y(yy)); P.lineTo(X(Ri), Y(yy < 1 ? -tl : h + tl)); P.lineTo(X(Ri + td), Y(yy < 1 ? -tl : h + tl)); P.lineTo(X(Ri + td), Y(yy)); P.closePath(); ctx.fill(P); };
  tab(0); tab(h);
  ctx.strokeStyle = C.accent; ctx.globalAlpha = 0.5; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.4;
  line(X(Ri), Y(0), X(Ri), Y(h)); ctx.setLineDash([]); ctx.globalAlpha = 1;

  // 注釈
  ctx.font = "600 12px 'Hiragino Sans', system-ui"; ctx.textAlign = "left";
  const note = (x, y, txt, col) => { ctx.fillStyle = col; ctx.fillText(txt, x, y); };
  const farR = X(maxX);
  ctx.strokeStyle = C.accent; ctx.lineWidth = 1.2;
  line(X(Ri + td), Y(-tl / 2), farR + 12, Y(-tl / 2)); note(farR + 16, Y(-tl / 2) + 4, "爪（上下同位置・内側）", C.accent);
  ctx.strokeStyle = C.groove;
  const midY = (cutY(p) + h - cutY(p)) / 2;
  line(X(outerR(p, midY / h)) + 4, Y(midY), farR + 12, Y(midY)); note(farR + 16, Y(midY) + 4, "外縁の帯（溝）", C.groove);
  if (c > 0) { ctx.strokeStyle = C.neck; line(X(outerR(p, 0)) + 4, Y(cutY(p) * 0.5), farR + 12, Y(cutY(p) * 0.5)); note(farR + 16, Y(cutY(p) * 0.5) + 4, "首（竹ひご無し）", C.neck); }
}
