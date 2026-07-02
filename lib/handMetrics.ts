import type { Pt } from "./palmLines";

/**
 * 手型・指の特徴を MediaPipe の21ランドマークから測る（純粋関数・テスト可能）。
 * docs/09 の設計に対応。距離の比率・相対比較のみを使い、線トレースには依存しない。
 *
 * 入力 lm は「画像ピクセル座標」の21点（正規化座標はアスペクト比で歪むため、
 * 呼び出し側で width/height を掛けてピクセルにしてから渡す）。
 *
 * ランドマーク番号：0=手首 / 親指1-4 / 人差し指5-8 / 中指9-12 / 薬指13-16 / 小指17-20
 * （各指：MCP付け根→PIP→DIP→TIP先端）。
 */

export type HandType = "earth" | "fire" | "air" | "water";

export type HandMetrics = {
  handType: HandType | null; // 四大手型（判定できた場合）
  palmRatio: number; // palmLen / palmBrd（大きいほど縦長）
  fingerRatio: number; // middleLen / palmLen（大きいほど指が長い）
  fingersOverall: "long" | "short" | "standard";
  indexVsRing: "index_long" | "ring_long" | "even"; // pose不変で確実
  pinkyLong: boolean; // 小指が薬指の第一関節(DIP)を超えるか
  confidence: number; // 0..1（指が開いて正対しているか）
};

// ── 暫定しきい値（実写サンプルで較正する。docs/09 A-3）───────────
const T_PALM_SQUARE = 1.55; // palmRatio これ未満＝正方形寄り、以上＝縦長
const T_FINGER_MID = 0.9; // 手型の指長短の分岐（binary）
const T_FINGER_LONG = 0.98; // fingersOverall: これ以上＝長い
const T_FINGER_SHORT = 0.82; // fingersOverall: これ未満＝短い（間は standard）
const REL_TOL = 0.03; // 相対比較の許容（3%）

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function computeHandMetrics(lm: Pt[]): HandMetrics | null {
  if (!lm || lm.length < 21) return null;
  const wrist = lm[0];
  const baseMid = mid(lm[5], lm[17]); // 指付け根ライン(人差し指〜小指)の中点
  const palmLen = dist(wrist, baseMid);
  const palmBrd = dist(lm[5], lm[17]);
  if (palmLen <= 0 || palmBrd <= 0) return null;

  const palmRatio = palmLen / palmBrd;
  const middleLen = dist(lm[9], lm[12]);
  const fingerRatio = middleLen / palmLen;

  // パーム上向き軸（手首→指）。指の「伸び具合」を測る基準（pose不変）。
  const up = {
    x: (baseMid.x - wrist.x) / palmLen,
    y: (baseMid.y - wrist.y) / palmLen,
  };
  const reach = (p: Pt) => (p.x - baseMid.x) * up.x + (p.y - baseMid.y) * up.y;

  // 手型（四大分類）。手のひら形×指長短の2×2。
  const square = palmRatio < T_PALM_SQUARE;
  const longFingerForType = fingerRatio >= T_FINGER_MID;
  const handType: HandType = square
    ? longFingerForType
      ? "air"
      : "earth"
    : longFingerForType
      ? "water"
      : "fire";

  // 指全体の長短（3段階：中間は standard＝断定しない）。
  const fingersOverall: HandMetrics["fingersOverall"] =
    fingerRatio >= T_FINGER_LONG
      ? "long"
      : fingerRatio < T_FINGER_SHORT
        ? "short"
        : "standard";

  // 相対比較（確実）：人差し指 vs 薬指。
  const indexLen = dist(lm[5], lm[8]);
  const ringLen = dist(lm[13], lm[16]);
  const ir = indexLen / ringLen;
  const indexVsRing: HandMetrics["indexVsRing"] =
    ir > 1 + REL_TOL ? "index_long" : ir < 1 - REL_TOL ? "ring_long" : "even";

  // 小指が薬指の第一関節(DIP=15)を超えるか（パーム軸への射影で判定）。
  const pinkyLong = reach(lm[20]) > reach(lm[15]);

  // 確信度：4指先の伸び具合（指を開いて正対しているほど高い）。
  const tipReach = [8, 12, 16, 20].map((i) => reach(lm[i]) / palmLen);
  const avgTip = tipReach.reduce((s, n) => s + n, 0) / tipReach.length;
  const confidence = Math.max(0, Math.min(1, (avgTip - 0.2) / 0.5));

  return {
    handType,
    palmRatio,
    fingerRatio,
    fingersOverall,
    indexVsRing,
    pinkyLong,
    confidence,
  };
}
