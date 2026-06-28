# 06. データスキーマ（palm_rules.json）

手相診断の知識ベース `data/palm_rules.json` の構造定義。
**診断の文言はすべてここに集約する。** コードは文言を持たない。

---

## トップレベル

```jsonc
{
  "meta": { ... },              // 説明・免責・スコープ
  "hand_policy": { ... },       // 左右の手の扱い・決め方
  "feature_definitions": { ... },// 特徴量の定義（enum値と物理量の対応）
  "lines": { ... },             // ★各線の診断ルール（中核）
  "flow_years": { ... },        // 流年法（時期判定）
  "challenges": { ... }         // 既知の課題メモ
}
```

---

## feature_definitions（特徴量の定義）

各特徴量の取りうる値（enum）と、画像処理で測る物理量の対応。

```jsonc
"length": {
  "type": "enum",
  "values": ["long", "standard", "short"],
  "physical_measure": "線の全長 / 手のひら基準長で正規化"
}
```

| 特徴量 | 値 | 使う線 |
|---|---|---|
| length | long / standard / short | 多くの線 |
| curve | deep / standard / shallow | 生命線 |
| depth | dark / standard / faint | 濃さ全般 |
| slope | downward / straight / upward | 知能線 |
| start_height | high / standard / low | 感情線 |
| start_origin | attached / separated / from_lifeline | 知能線・運命線 |
| continuity | continuous / broken / chained | 生命線・運命線 |
| presence | present / absent | 運命線・extra3 |
| count | single / multiple | extra3 |
| direction | upward / straight / downward | 結婚線 |

> `standard` 値は**ルールを持たせない**（特記なし）。

---

## lines（各線の診断ルール）★中核

線キー（life_line 等）をキーにしたオブジェクト。

```jsonc
"life_line": {
  "name_ja": "生命線",
  "theme": "生命力・健康・バイタリティ",
  "group": "base",               // base | extra（省略時はbase扱い）
  "mvp_features": ["length","curve","depth"],     // MVPで判定する特徴
  "advanced_features": ["continuity"],            // 後フェーズの特徴

  // 単一特徴 → 解釈文。standardは含めない。
  "rules": [
    { "feature": "length", "value": "long",  "interpretation": "…" },
    { "feature": "depth",  "value": "faint", "interpretation": "…" }
  ],

  // 特徴の組み合わせ → 踏み込んだ一文（深掘り解説）
  "combos": [
    { "when": { "length": "long", "depth": "dark" }, "text": "…" }
  ],

  // 特徴値 → ひとことアドバイス（諭し）
  "advice": {
    "faint": "疲れをため込みやすいので、休息を意識的に。…",
    "short": "環境の変わり目が転機に。体調の変化にも目を向けて。…"
  }
}
```

### フィールド詳細

| フィールド | 必須 | 説明 |
|---|---|---|
| name_ja | ✓ | 表示名 |
| theme | ✓ | テーマ（結果のラベルに使う） |
| group | | "base" or "extra"。extra3線は "extra" |
| mvp_features | ✓ | MVPで判定する特徴量キーの配列 |
| advanced_features | | 後フェーズで扱う特徴量 |
| rules | ✓ | 単一特徴の解釈。`{feature, value, interpretation}` の配列 |
| combos | | 組み合わせ解釈。`{when:{特徴:値,...}, text}` の配列。先に一致したもの勝ち |
| advice | | 特徴値→諭し文のマップ |

### combos の評価ルール
- `when` の全条件を満たす**最初の**comboを採用（配列順 = 優先順）。
- 強い組み合わせ（特殊な相）を配列の上に置く。

### advice の評価ルール
- その線の各特徴値が `advice` のキーにあれば、その文を採用。
- 複数該当したら全て連結（または優先度上位のみ表示）。

---

## hand_policy（左右の扱い）

```jsonc
"hand_policy": {
  "hand_meaning": {
    "left":  { "axis": "先天運", "represents": ["生まれ持った資質", ...] },
    "right": { "axis": "後天運", "represents": ["努力で築いたもの", ...] }
  },
  "dominance_policy": {
    // 本アプリは "handedness"（利き手方式）のみ採用
    "default": "handedness"
  },
  "left_right_diff": { "rules": [ ... ] }  // 左右差診断（後フェーズ）
}
```

> 設計図JSONには gender/age 等の他流派オプションも残っているが、
> **本アプリは利き手方式のみ実装**する（docs/02 参照）。

---

## flow_years（流年法・後フェーズ）

```jsonc
"flow_years": {
  "fate_line":     { "anchors": [ { "position_ratio": 0.0, "age": 0 }, ... ] },
  "marriage_line": { "anchors": [ { "position_ratio": 0.0, "age": 16 }, ... ] }
}
```

線上の位置 `position_ratio`（0.0〜1.0）を年齢に線形補間する。
年齢は幅をもって提示（ピンポイント禁止）。

---

## 拡張のしかた

- **新しい線を足す**：`lines` にキーを追加。group・rules・combos・advice を埋める。
- **新しい特徴を足す**：`feature_definitions` に定義 → 各線の rules/combos で参照。
- **診断文を調整**：該当の `interpretation` / `text` / `advice` を編集するだけ。
  コードは触らない。トーンは docs/02 を厳守。

---

## 検証

```bash
python3 -c "import json; json.load(open('data/palm_rules.json')); print('valid')"
```

CI に上記を組み込み、JSONが壊れたらビルドを止めるのが望ましい。
