import { RULES, LINE_ORDER, isExtra } from "./rules";
import type { HandMetrics } from "./handMetrics";
import type { Features, Hand, LineDef, LineKey, LineResult, Mode } from "./types";

/** 手型の定義（palm_rules.json hand_types）。 */
export type HandTypeReading = {
  name_ja: string;
  theme: string;
  text: string;
  advice?: string;
};

/** 手型を読む（landmark実測 → 文言）。確信度が低い/判定不能なら null。 */
export function readHandType(m: HandMetrics | null): HandTypeReading | null {
  if (!m || !m.handType || m.confidence < 0.4) return null;
  const table = RULES.hand_types as
    | Record<string, HandTypeReading>
    | undefined;
  return table?.[m.handType] ?? null;
}

/** 指の特徴を読む（確実な信号のみ・複数可）。 */
export function readFingers(m: HandMetrics | null): string[] {
  if (!m || m.confidence < 0.4) return [];
  const f = RULES.fingers as
    | {
        overall?: Record<string, string>;
        index_vs_ring?: Record<string, string>;
        pinky?: Record<string, string>;
      }
    | undefined;
  if (!f) return [];
  const out: string[] = [];
  if (m.fingersOverall !== "standard" && f.overall?.[m.fingersOverall]) {
    out.push(f.overall[m.fingersOverall]);
  }
  if (m.indexVsRing !== "even" && f.index_vs_ring?.[m.indexVsRing]) {
    out.push(f.index_vs_ring[m.indexVsRing]);
  }
  if (m.pinkyLong && f.pinky?.long) out.push(f.pinky.long);
  return out;
}

/**
 * 診断ロジック（純粋関数）。文言は一切持たず、palm_rules.json を引くだけ。
 * docs/05_diagnosis_logic.md の仕様に対応。
 */

/** 1手分の特徴量から、特記のある線だけ診断結果を組む。standard は無視。 */
export function diagnoseHand(
  allFeatures: Record<LineKey, Features>,
): LineResult[] {
  const out: LineResult[] = [];
  for (const line of LINE_ORDER) {
    const def = RULES.lines[line];
    const feats = allFeatures[line] || {};
    const texts: string[] = [];
    for (const [feat, val] of Object.entries(feats)) {
      if (val === "standard") continue;
      const rule = (def.rules || []).find(
        (r) => r.feature === feat && r.value === val,
      );
      if (rule) texts.push(rule.interpretation);
    }
    if (texts.length) {
      out.push({
        line,
        def,
        feats,
        texts,
        absent: feats.presence === "absent",
      });
    }
  }
  return out;
}

/** 特徴の組み合わせ → 踏み込んだ一文。when を全て満たす最初の combo を返す。 */
export function comboFor(def: LineDef, feats: Features): string | null {
  if (!def.combos) return null;
  for (const c of def.combos) {
    if (Object.entries(c.when).every(([k, v]) => feats[k] === v)) return c.text;
  }
  return null;
}

/** 特徴値 → ひとことアドバイス（諭し）を集める。重複は除く。 */
export function adviceFor(def: LineDef, feats: Features): string[] {
  if (!def.advice) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const val of Object.values(feats)) {
    const text = def.advice[val];
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}

/** 主に見る手。片手はその手、両手は利き手。 */
export function primaryHand(mode: Mode, handedness: Hand): Hand {
  if (mode !== "both") return mode;
  return handedness;
}

/** 各手の時間軸ラベル（左右で固定。流派で変えない）。 */
export function axisFor(hand: Hand, handedness: Hand): string {
  return hand === handedness
    ? "後天運 ・ いまのあなた"
    : "先天運 ・ 生まれ持った本質";
}

/** 総合サマリー。基本4線のうち1つを取り上げる。 */
export function overall(diag: LineResult[]): string {
  const have = diag.filter((d) => !isExtra(d.def) && !d.absent);
  if (!have.length) {
    return "今は線の動きが穏やかな時期。これからの行動で手相は変わっていきます。";
  }
  const pick = have[Math.floor(Math.random() * have.length)];
  return `いまのあなたは「${pick.def.theme}」が特に表れています。${pick.texts[0]}`;
}

/** 左右差（両手モード）。後フェーズの簡易版。 */
export function diffText(): string {
  const opts = [
    "生まれ持った素質を、努力でうまく活かしてきたタイプ。経験を重ねて成長しています。",
    "生まれ持った運勢と今の生き方が一致。自分らしく無理のない歩み方ができています。",
    "先天的なものと今の自分にギャップがあり、人生に変化や波が起こりやすい時期です。",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

// ───────────────────────────────────────────────────────────────────
// モック検出（線検出は未実装）。実装時に置き換える唯一の箇所。
// 実際の画像から特徴量を測るのではなく、ランダムに特徴量を生成する。
// → UI には「検出イメージ（実検出ではない）」と必ず明示すること。
// ───────────────────────────────────────────────────────────────────

const FEAT_OPTS: Record<string, string[]> = {
  length: ["long", "standard", "short"],
  curve: ["deep", "standard", "shallow"],
  depth: ["dark", "standard", "faint"],
  slope: ["downward", "straight", "upward"],
  start_height: ["high", "standard", "low"],
  presence: ["present", "absent"],
  count: ["single", "multiple"],
  direction: ["upward", "straight", "downward"],
};

/** モック生成で各線に振る特徴量（プロトタイプの振り分けに対応）。 */
const GEN_FEATURES: Record<LineKey, string[]> = {
  life_line: ["length", "curve", "depth"],
  head_line: ["slope", "length"],
  heart_line: ["length", "start_height", "depth"],
  fate_line: ["presence", "length", "depth"],
  sun_line: ["presence", "length", "depth", "count"],
  money_line: ["presence", "depth", "count"],
  marriage_line: ["presence", "length", "depth", "direction", "count"],
};

export function genMockFeatures(): Record<LineKey, Features> {
  const f = {} as Record<LineKey, Features>;
  for (const line of LINE_ORDER) {
    const def = RULES.lines[line];
    f[line] = {};
    const feats = GEN_FEATURES[line];
    if (isExtra(def)) {
      // extra3 は「ない人」が多い。45%で未検出（前向きに解釈）。
      if (Math.random() < 0.45) {
        f[line] = { presence: "absent" };
        continue;
      }
      if (feats.includes("presence")) f[line].presence = "present";
    }
    for (const ft of feats) {
      if (ft === "presence") continue;
      if (Math.random() < 0.7) {
        const opts = FEAT_OPTS[ft];
        f[line][ft] = opts[Math.floor(Math.random() * opts.length)];
      }
    }
  }
  return f;
}
