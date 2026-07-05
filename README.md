# 張型スタジオ — Lamp Kit Generator

あかりランプ(岐阜提灯 / イサム・ノグチ **AKARI** 方式)を自作するための、
**3Dプリント用「張型(はりがた)」ジェネレーター**。

ブラウザ上でシルエットをパラメトリックに調整し、印刷用の STL を書き出せます。
出力パーツは 3 種:

| パーツ | 役割 |
| --- | --- |
| **羽根板 (rib)** | 型の縦骨。外周縁に竹ひご用の半円溝を持つ板 × N 枚 |
| **コマ (koma)** | 上下端の丸板。開放ノッチで羽根板の端タブを保持 |
| **土台 (stand)** | 作業台。コマの縁を受けて型ごと回せる U 字サドル × 2 |

---

## 技術構成

軽さ重視の最小構成:

- **Vite** — 高速なビルド / 開発サーバー
- **React 18**
- **three.js** — WebGL による 3D プレビュー & STL 生成(外部ライブラリ非依存)

ビルド成果物は静的ファイルのみ。バックエンド不要。

---

## ローカル開発

```bash
npm install
npm run dev        # http://localhost:5173 (--host 付きなので同一LAN内のスマホからも可)
npm run build      # dist/ に本番ビルド
npm run preview    # ビルド結果をローカル確認
```

`npm run dev` は `--host` 付きで起動するので、同じ Wi-Fi 内のスマホから
`http://<PCのローカルIP>:5173` で確認できます。

---

## デプロイ(Vercel)

このリポジトリを Vercel に接続すると、`git push` ごとに自動ビルド & デプロイされます。
Vite は自動検出されるため追加設定は不要です(Framework Preset: **Vite**)。

### スマホから「自分だけ」見られるようにする(推奨)

Vercel の **Deployment Protection → Vercel Authentication** を有効にすると、
デプロイ URL は **Vercel アカウントにログインしている本人だけ** が開けます(無料)。

1. [vercel.com](https://vercel.com) にアカウントでログイン
2. **Add New… → Project** から本リポジトリ (`shunyakoide/lamp-kit-generator`) を Import
3. Framework Preset が **Vite** になっていることを確認して **Deploy**
4. Project → **Settings → Deployment Protection** で **Vercel Authentication** を ON
5. 発行された URL をスマホで開く → 同じ Vercel アカウントでログインすれば本人のみ閲覧可

> ホスト非依存(`vite.config.js` の `base: "./"`)で作ってあるため、
> あとから GitHub Pages / Netlify 等へ移しても再設定は不要です。

---

## 使い方

- 上部タブ … **組立 / 印刷 / 点灯** ビュー切替
- 下部パネル … つまみをドラッグでプリセット選択、シートを引き上げてスライダー調整
- **羽根板 / コマ / 土台** ボタン … 各 STL をダウンロード
- プレビュー … ドラッグで回転、ホイール / ピンチでズーム

### 制作フロー(実物側)

印刷 → コマ 2 枚のノッチに羽根板を番号順に差し込み(0 番はキー=深い)→
溝に竹ひごを巻く → 糊 + 和紙を張る → 乾燥 → コマを外し羽根板を上下開口から抜く →
火袋の完成 → 三本脚等で照明化。

---

## ライセンス

Private / 個人プロジェクト。
