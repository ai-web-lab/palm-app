# 10. 公開（静的ホスティング）手順

このアプリは **API を持たない完全クライアント動作**なので、静的サイトとして公開できる。
`next.config.mjs` に `output: "export"` を設定済み → `npm run build` で `out/` が生成される。

> ⚠️ カメラ(getUserMedia)は **HTTPS 必須**。Cloudflare Pages / Netlify はどちらも HTTPS 配信なのでOK。
> （スマホを PC の LAN IP `http://192.168.x.x:3000` で開くと HTTPS でないためカメラは動かない。アップロードは可）
> ※ 画像は端末内で処理し外部送信しない。MediaPipe のモデルのみ Google CDN から取得（コードであり手画像ではない）。

ビルド成果物 `out/` に含まれるもの：`index.html` / `_next/` / `icon.png` / `mediapipe/wasm`。

---

## Netlify（`netlify.toml` 同梱済み）

1. https://app.netlify.com/ にログイン（GitHubアカウントで可）。
2. **Add new site → Import an existing project → GitHub** で `ai-web-lab/palm-app` を選択。
3. ブランチを選ぶ（例：`claude/palmistry-app-review-h25tyu` または main）。
4. ビルド設定は `netlify.toml` を自動採用：
   - Build command: `npm run build`
   - Publish directory: `out`
   - Node: 20（`.node-version` / `netlify.toml` で指定）
5. Deploy → `https://<site-name>.netlify.app` が発行される。スマホでそのURLを開く。

---

## Cloudflare Pages

1. https://dash.cloudflare.com/ → **Workers & Pages → Create → Pages → Connect to Git**。
2. `ai-web-lab/palm-app` を選択、ブランチを指定。
3. ビルド設定：
   - Framework preset: **Next.js (Static HTML Export)**（無ければ None）
   - Build command: `npm run build`
   - Build output directory: `out`
   - 環境変数に `NODE_VERSION = 20`（または `.node-version` を参照）
4. Save and Deploy → `https://<project>.pages.dev` が発行される。

---

## 補足

- SPA的なクライアントルーティングは無し（単一ページ＋Reactのstepステート）。リダイレクト設定は不要。
- 再デプロイはブランチに push すれば自動（Netlify/Cloudflare とも Git連携で自動ビルド）。
- GitHub Pages に出す場合はサブパス配信のため追加対応が必要（`basePath` と
  `lib/handDetect.ts` の `WASM_URL` の接頭辞）。当面は Netlify / Cloudflare を推奨。
