import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" で相対パス出力 → Vercel / Netlify / GitHub Pages のどれでも
// 再設定なしにそのまま動く(ホスト非依存)。
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2020",
    // three.js 単独チャンクは意図的なので警告閾値を引き上げる
    chunkSizeWarningLimit: 700,
    // three.js は大きめなので単独チャンクに分離しキャッシュ効率を上げる
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
});
