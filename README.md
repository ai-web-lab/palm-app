# 掌相（Palm Reading）— 手相診断Webアプリ

カメラで撮影した手のひらから手相の線を検出し、手相学にもとづいて占うWebアプリ。
本格的な手相学の知識ベースを持ち、検出した線の長さ・濃さ・形からユーザーごとに
踏み込んだ診断とアドバイスを返す。

> ⚠️ 本アプリは**娯楽目的**の手相占いです。寿命・病気・死を断定する診断は行いません。

---

## 何ができるか

1. 利き手を選ぶ（→ 先天運／後天運の割り当てに使う）
2. 占う手を選ぶ（右手 / 左手 / 両手）
3. 手のひらを**撮影**（実カメラ）するか、手の**写真をアップロード**する（両手の場合は片手ずつ）
4. 撮影画像から手相の線を検出し、写真の上に線を重ねて表示
5. 線をタップすると、その線の診断・深掘り解説・ひとことアドバイスが出る

---

## プロジェクト構成

```
palm-app/
├── README.md                  ← このファイル。全体像と着手方法
├── CLAUDE.md                  ← AIコーディング支援(Claude Code等)向けの作業指針
├── data/
│   └── palm_rules.json        ← 手相診断の知識ベース（線・ルール・流年法）★中核
├── prototype/
│   └── prototype.html         ← 動く画面プロトタイプ（HTML単体）
└── docs/
    ├── 01_overview.md         ← 企画・スコープ・用語
    ├── 02_palmistry_spec.md   ← 手相学の仕様（7大線・左右・トーン方針）
    ├── 03_architecture.md     ← 技術構成・処理パイプライン・データモデル
    ├── 04_ui_flow.md          ← 画面遷移・各画面の仕様
    ├── 05_diagnosis_logic.md  ← 診断ロジック（ルール照合・深掘り・流年法）
    ├── 06_data_schema.md      ← palm_rules.json のスキーマ定義
    ├── 07_roadmap.md          ← 開発フェーズ・課題・リスク
    └── 08_line_extraction_design.md ← 実線抽出パイプライン設計（OpenCV.js, ②）
```

---

## クイックスタート

### プロトタイプ（仕様の正本）
ビルド不要。ブラウザで開くだけで動く。画面フロー・診断ロジックの参照用に残す。

```bash
open prototype/prototype.html        # macOS
# または任意の静的サーバで
npx serve prototype
```

撮影は実カメラではなくモック（撮影ボタンで擬似的に線を検出する演出）。

### Next.js アプリ（本実装）
フロントは **Next.js（React / App Router）** を採用。プロトタイプの画面フローと
診断ロジックを移植済みで、入力は**実カメラ撮影（getUserMedia）**と
**画像アップロード**の両対応。

```bash
npm install
npm run dev      # http://localhost:3000
# 本番ビルド
npm run build && npm run start
```

- 画面：利き手 → 占う手 → 撮影/アップロード → 結果。
- 撮影画面は「カメラで撮影」「画像をアップロード」をタブで切替（どちらも片手ずつ）。
- 知識ベース `data/palm_rules.json` を読み込んで診断（文言はコードに持たない）。
- **線オーバーレイは MediaPipe Hands で手に追従**：手の21ランドマークを検出し、
  線テンプレートをアフィン変換して実際の手に重ねる（`lib/handDetect.ts` / `lib/palmLines.ts`）。
  - WASMは `public/mediapipe/`（`npm install`/build時に node_modules からコピー、git管理外）。
    モデルは公式CDNから取得。**手の画像はブラウザ内で処理し外部送信しない**。
  - 検出できない場合は固定座標のイメージ表示にフォールバック。
- **線そのものの自動抽出・特徴量測定はまだモック**（ランダム生成）。
  実線抽出（OpenCV.js）は未実装（→ docs/07_roadmap.md のPhase 1）。
- **（任意・β）LLM特徴量抽出**：占う手の選択画面で「AIで手相を解析する」に同意すると、
  画像を `app/api/diagnose`（サーバ）経由で Claude Vision に送り、線の特徴量だけを
  構造化出力で受け取って診断する（文言は `palm_rules.json` 側で制御）。
  - 利用には環境変数 `ANTHROPIC_API_KEY`（サーバ側のみ）が必要。`.env.example` 参照。
  - **同意した時だけ外部送信**。未同意・キー未設定・失敗時はモックにフォールバック。
  - ⚠️ この経路のみ画像が外部APIに送られる。本番運用時は同意取得とプライバシーポリシー整備が前提。

#### ディレクトリ
```
app/         ← Next.js App Router（layout / page / globals.css / icon）
components/   ← CaptureStep（カメラ・アップロード）/ ResultStep
lib/         ← rules（JSON読込・色・座標）/ diagnosis（診断ロジック・モック検出）/ types
data/        ← palm_rules.json（知識ベース＝正本）
prototype/   ← 旧プロトタイプ（仕様の正本として保存）
```

---

## 技術スタック（想定）

| 領域 | 採用候補 | 備考 |
|---|---|---|
| フロント | **Next.js（React / App Router）** | プロトタイプHTMLから移植。**採用決定** |
| 入力 | 実カメラ（getUserMedia）／ 画像アップロード | どちらでも占える。片手ずつ |
| 手の検出 | MediaPipe Hands | 手の21ランドマーク取得 |
| 線の抽出 | OpenCV.js（エッジ/Gaborフィルタ） | ★最難関。精度に限界あり |
| 知識ベース | `data/palm_rules.json` | コードから文言を分離 |
| デプロイ | Vercel等（Next.js） | 画像処理はクライアント側で完結が理想 |

---

## 開発を始める前に読むもの

1. `docs/01_overview.md` — 何を作るか
2. `docs/02_palmistry_spec.md` — 手相のドメイン知識（重要）
3. `docs/03_architecture.md` — どう作るか
4. `CLAUDE.md` — AI支援で開発する際の約束事

---

## いちばん大事な前提

**手相の線をカメラから正確に検出するのは技術的に非常に難しい。**
照明・肌色・しわとの区別などで精度が出にくく、研究レベルでも難題。
このリスクの扱い（半自動入力にする／多少のズレは許容する 等）は
未決定の最重要論点。詳細は `docs/07_roadmap.md` を参照。
