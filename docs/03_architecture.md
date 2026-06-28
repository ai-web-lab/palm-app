# 03. アーキテクチャ

## 処理パイプライン

```
入力画像（片手）          … 実カメラ撮影（getUserMedia）または 画像アップロード
  │
  ▼
[1] 手の検出・正規化    … MediaPipe Hands で21ランドマーク取得
  │                       向き・サイズ・左右を正規化
  ▼
[2] 線の抽出            … OpenCV.js でROIを切り出し、線をトレース ★最難関
  │                       生命線/知能線/感情線/運命線の領域から線を検出
  ▼
[3] 特徴量の測定        … 各線を enum 値に量子化
  │                       length/curve/depth/slope/start_height/...
  ▼
[4] ルール照合          … palm_rules.json の lines[*].rules と突き合わせ
  │
  ▼
[5] 深掘り・アドバイス  … combos（組み合わせ）と advice（諭し）を付与
  │
  ▼
[6] 手モード適用        … 利き手から先天/後天ラベル・主従を決定
  │                       両手なら左右差も（後フェーズ）
  ▼
[7] 結果描画            … 写真に線を重ね、タップで解説表示
```

- [1][2][3] が技術的難所。とくに [2] 線抽出が最難関。
- [4][5][6][7] は `palm_rules.json` とロジックで完結し、プロトタイプで実証済み。

---

## レイヤー構成

```
┌─────────────────────────────┐
│ UI層（画面遷移・撮影/アップロード・結果描画）│  ← Next.js（React）。prototype.html が仕様の正本
├─────────────────────────────┤
│ 診断ロジック層（ルール照合・深掘り）      │  ← JSONを読むだけの純粋関数
├─────────────────────────────┤
│ 知識ベース（palm_rules.json）          │  ← 文言とルールの集約。コード非依存
├─────────────────────────────┤
│ 画像処理層（手検出・線抽出・特徴量化）    │  ← MediaPipe + OpenCV.js（未実装）
└─────────────────────────────┘
```

**画像処理層と診断ロジック層の境界は「特徴量（LineFeatures）」。**
画像処理が `LineFeatures` を出力できれば、下流（診断〜描画）はそのまま動く。
この境界のおかげで、画像処理を後回しにしてUI・診断を先に完成できる。

---

## データモデル（中間表現）

```ts
// 画像処理[3]の出力 = 診断ロジック[4]の入力
type LineFeatures = {
  length?:       "long" | "standard" | "short";
  curve?:        "deep" | "standard" | "shallow";
  depth?:        "dark" | "standard" | "faint";
  slope?:        "downward" | "straight" | "upward";
  start_height?: "high" | "standard" | "low";
  presence?:     "present" | "absent";
  count?:        "single" | "multiple";
  direction?:    "upward" | "straight" | "downward";
  // 流年法用（後フェーズ）
  break_position_ratio?: number;
  position_ratio?: number;
  // 写真オーバーレイ用：検出した線の座標パス
  svgPath?: string;
};

type HandReading = {
  hand: "left" | "right";
  lines: Partial<Record<LineKey, LineFeatures>>;
};

type Input = {
  mode: "right" | "left" | "both";
  handedness: "right" | "left";
  hands: HandReading[];   // 片手は1要素、両手は2要素（右→左の順で撮影）
};
```

---

## 画像処理の現実（重要）

- 手相の線抽出は、照明・肌色・しわとの区別が難しく、**精度に限界がある**。
- MediaPipe Hands は「指の関節位置」は取れるが「手相の線」は取れない。
  線抽出は OpenCV.js で自前実装が必要（エッジ検出・Gaborフィルタ等）。
- 公開された学習済み線セグメンテーションモデルはほぼ無い。

### 現実的な段階戦略
1. まず手の検出・正規化（MediaPipe）で手の領域を確定。
2. 線抽出は基本4線（位置がほぼ決まっていて検出しやすい）から。
3. 完全自動が厳しければ、**ガイド線をなぞる半自動入力**にフォールバック。
   （撮影画面の赤いガイド線は、この半自動入力の下地としても使える設計）

---

## プライバシー

- 手の画像は**端末内で処理する**のが原則（外部送信しない）。
- カメラ撮影・アップロードのどちらでも同じ。アップロードした画像もブラウザ内で処理し、
  サーバへ送らない。診断後はメモリから破棄し保存しない。
- MediaPipe / OpenCV.js はクライアントサイドで動くため、これが可能。
- サーバ処理を選ぶ場合（精度向上のため）は、画像の取り扱いを明示し同意を取る。

---

## デプロイ

- フロントは **Next.js（React / App Router）**。画像処理がクライアント完結なら、
  静的書き出し（`next export`）でも、Vercel等のホスティングでも配信できる。
- `palm_rules.json` は静的アセット（`public/`）として配信し、フロントが fetch して使う。
