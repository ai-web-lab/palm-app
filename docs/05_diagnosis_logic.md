# 05. 診断ロジック

知識ベース（`palm_rules.json`）を読んで診断文を組み立てるロジック。
プロトタイプの実装を正とする。

---

## 全体の流れ

```js
function diagnose(input, rules) {
  const main = primaryHand(input);          // 主に見る手を決定
  const mainHand = input.hands.find(h => h.hand === main);
  const lines = diagnoseHand(mainHand.lines, rules); // 線ごとの診断
  // 検出できた（presence !== absent）線だけ結果に出す
  return lines.filter(r => !r.absent);
}
```

## 線ごとの診断

```js
function diagnoseHand(handLines, rules) {
  const out = [];
  for (const lineKey of LINE_ORDER) {
    const def = rules.lines[lineKey];
    const feats = handLines[lineKey] || {};
    const texts = [];
    // 各特徴量 → ルール表で解釈文を引く（standardは無視）
    for (const [feat, val] of Object.entries(feats)) {
      if (val === "standard") continue;
      const t = def.rules[feat]?.[val];
      if (t) texts.push(t);
    }
    if (texts.length) {
      out.push({ line: lineKey, def, feats, texts,
                 absent: feats.presence === "absent" });
    }
  }
  return out;
}
```

## 深掘り解説（特徴の組み合わせ）

```js
// whenの条件を全て満たす最初のcomboを返す
function comboFor(def, feats) {
  if (!def.combos) return null;
  for (const c of def.combos) {
    if (Object.entries(c.when).every(([k, v]) => feats[k] === v)) return c.text;
  }
  return null;
}
```

## アドバイス（諭し）

```js
// 特徴値に対応するadviceを集める
function adviceFor(def, feats) {
  if (!def.advice) return [];
  const out = [];
  for (const val of Object.values(feats)) {
    if (def.advice[val]) out.push(def.advice[val]);
  }
  return out;
}
```

→ 解説カードは「深掘り解説 → 個別特徴の箇条書き → アドバイス」の順で組む。

---

## 主に見る手の決定

```js
function primaryHand(input) {
  if (input.mode !== "both") return input.mode;  // 片手はその手
  return input.handedness;                        // 両手は利き手を主に
}

// 各手の時間軸ラベル（左右で固定、流派で変えない）
function axisFor(hand, handedness) {
  return hand === handedness ? "後天運・いまのあなた"
                             : "先天運・生まれ持った本質";
}
```

---

## 流年法（後フェーズ）

線上の位置（0.0〜1.0）を年齢に変換。`rules.flow_years[lineKey].anchors` を線形補間。

```js
function ratioToAge(ratio, anchors) {
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    if (a.position_ratio <= ratio && ratio <= b.position_ratio) {
      const t = (ratio - a.position_ratio) / (b.position_ratio - a.position_ratio);
      return Math.round(a.age + t * (b.age - a.age));
    }
  }
}
```

→ 結果は「30代前半ごろ」のように幅をもたせて提示（ピンポイント禁止）。

---

## 左右差（両手モード・後フェーズ）

```js
function diffDiagnosis(hands, rules) {
  // 左右の特徴量を比較し、rules.hand_policy.left_right_diff のルールに照合
  // - ほぼ同じ → 「自分らしく無理のない生き方」
  // - 大きく違う → 「変化や波が起こりやすい」
  // - 右が良い → 「素質を努力で活かし成長」
  // ※ extra3は左右で有無が違いやすいので基本4線に限定して比較
}
```

---

## 設計上の鉄則（再掲）

- 文言はコードに書かず `palm_rules.json` に置く。
- `standard` は診断文を出さない（特記のある線だけ）。
- extra3は未検出が正常。前向きに解釈し、左右差比較からは除外。
- トーンは `docs/02_palmistry_spec.md` の方針を厳守。
