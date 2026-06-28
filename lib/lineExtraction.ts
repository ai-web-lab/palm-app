import type { Pt } from "./palmLines";
import type { LineKey } from "./types";

/**
 * 実線抽出（②）— 画像から手相の主要線を実際にトレースする。
 *
 * docs/08 のパイプラインを純JSで実装：
 *  - グレースケール化
 *  - black-hat（局所平均との差＝暗い溝の強調）を積分画像でO(1)サンプル
 *  - 指の谷＋手首で作るパーム座標系の中で、各線の期待方向に直交方向探索して
 *    最も暗い画素にスナップ＝実際の線をトレース
 *  - 線の長さ/濃さ/カーブ等を実測（特徴量）
 *
 * ※ ブラウザ依存（Canvas読み取り）は extractPalmLines、純粋ロジックは
 *   extractFromGray に分離（後者は単体テスト可能）。
 */

export type Lm = { x: number; y: number }; // 正規化 0..1

export type ExtractResult = {
  lines: Partial<Record<LineKey, Pt[]>>; // 画像ピクセル座標
  features: Partial<Record<LineKey, Record<string, string>>>;
  confidence: Partial<Record<LineKey, number>>; // 0..1
};

// ── パーム座標系 P(u,v) を作る ──────────────────────────────
// A=人差し指‑中指の谷, B=薬指‑小指の谷, W=手首。
// P(u,v) = A + u*(B-A) + v*(W - mid(A,B))
function palmFrame(lmPx: Pt[]) {
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const A = mid(lmPx[5], lmPx[9]);
  const B = mid(lmPx[13], lmPx[17]);
  const W = lmPx[0];
  const u = { x: B.x - A.x, y: B.y - A.y };
  const m = mid(A, B);
  const v = { x: W.x - m.x, y: W.y - m.y };
  const P = (uu: number, vv: number): Pt => ({
    x: A.x + uu * u.x + vv * v.x,
    y: A.y + uu * u.y + vv * v.y,
  });
  // 逆変換 px→(u,v)（2x2連立）
  const det = u.x * v.y - u.y * v.x;
  const toUV = (p: Pt): { u: number; v: number } => {
    const dx = p.x - A.x;
    const dy = p.y - A.y;
    return {
      u: (dx * v.y - dy * v.x) / det,
      v: (u.x * dy - u.y * dx) / det,
    };
  };
  const palmW = Math.hypot(u.x, u.y);
  const palmH = Math.hypot(v.x, v.y);
  return { P, toUV, palmW, palmH };
}

// ── black-hat（局所平均の差）を積分画像で ─────────────────
function integralImage(gray: Float32Array, W: number, H: number): Float64Array {
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let rs = 0;
    for (let x = 0; x < W; x++) {
      rs += gray[y * W + x];
      I[(y + 1) * (W + 1) + (x + 1)] = I[y * (W + 1) + (x + 1)] + rs;
    }
  }
  return I;
}
function boxMean(
  I: Float64Array,
  W: number,
  H: number,
  x: number,
  y: number,
  r: number,
): number {
  const x0 = Math.max(0, x - r);
  const y0 = Math.max(0, y - r);
  const x1 = Math.min(W - 1, x + r);
  const y1 = Math.min(H - 1, y + r);
  const area = (x1 - x0 + 1) * (y1 - y0 + 1);
  const s =
    I[(y1 + 1) * (W + 1) + (x1 + 1)] -
    I[y0 * (W + 1) + (x1 + 1)] -
    I[(y1 + 1) * (W + 1) + x0] +
    I[y0 * (W + 1) + x0];
  return s / area;
}

type Tracer = (x: number, y: number) => number; // darkness ≥ 0

// CVが安定して扱える基本4線のみ対象。extra3(太陽/財運/結婚線)は短く薄く、
// 基本線(特に感情線)へ誤吸着しやすいためCVでは扱わない（AIモード or 未検出）。
type BaseLine = "life_line" | "head_line" | "heart_line" | "fate_line";

// ── 各線の探索設定（パーム座標系） ───────────────────────
type TraceCfg = {
  /** along（線に沿う）座標の値の並び */
  along: number[];
  /** 探索する軸: 'v'=along は u を固定して v を探す / 'u'=along は v 固定で u を探す */
  searchAxis: "u" | "v";
  range: [number, number];
  steps: number;
  /** 期待する探索座標値（along 値の関数）。ここからの近さで重み付けし誤スナップを防ぐ。 */
  expected: (a: number) => number;
  /** 期待からの許容幅（探索座標単位） */
  sigma: number;
};
const linspace = (a: number, b: number, n: number) =>
  Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

// 生命線の弧：湾曲を反転（中央側へ膨らむ）し、ベースを-0.05内側へ。
// 手の輪郭へ吸着しないよう中央寄り＆控えめな膨らみに。
const lifeArc = (v: number) => {
  const t = Math.max(0, Math.min(1, (v - 0.42) / (0.96 - 0.42)));
  return -0.15 + 0.12 * Math.sin(Math.PI * t); // -0.15 〜 -0.03（逆湾曲・中央寄り）
};

const CFG: Record<BaseLine, TraceCfg> = {
  // 感情線：付け根のすぐ下を 小指側→人差し指側 へ横断（u に沿い v を探索）
  heart_line: { along: linspace(1.25, -0.15, 15), searchAxis: "v", range: [0.04, 0.32], steps: 26, expected: () => 0.16, sigma: 0.06 },
  // 知能線：中央を横断（感情線より下）。少し上(指側)へ寄せる。
  head_line: { along: linspace(-0.25, 1.05, 14), searchAxis: "v", range: [0.16, 0.5], steps: 26, expected: () => 0.33, sigma: 0.09 },
  // 運命線：中央を縦に（v に沿い u を探索）
  fate_line: { along: linspace(0.95, 0.18, 14), searchAxis: "u", range: [0.28, 0.64], steps: 26, expected: () => 0.47, sigma: 0.1 },
  // 生命線：親指側の弧（v に沿い u を負側で探索）。範囲を内側に制限し輪郭吸着を防止＆中央寄りに。
  life_line: { along: linspace(0.42, 0.96, 16), searchAxis: "u", range: [-0.36, 0.08], steps: 28, expected: lifeArc, sigma: 0.12 },
};

function traceLine(
  cfg: TraceCfg,
  P: (u: number, v: number) => Pt,
  dark: Tracer,
): { pts: Pt[]; darks: number[] } {
  const pts: Pt[] = [];
  const darks: number[] = [];
  for (const a of cfg.along) {
    const e = cfg.expected(a);
    let bestScore = -1;
    let bestPt: Pt | null = null;
    let bestDark = 0;
    for (let i = 0; i < cfg.steps; i++) {
      const s = cfg.range[0] + ((cfg.range[1] - cfg.range[0]) * i) / (cfg.steps - 1);
      const uu = cfg.searchAxis === "v" ? a : s;
      const vv = cfg.searchAxis === "v" ? s : a;
      const p = P(uu, vv);
      const d = dark(Math.round(p.x), Math.round(p.y));
      // 暗さ × 期待位置への近さ（ガウス重み）で評価＝誤スナップ抑制
      const w = Math.exp(-((s - e) * (s - e)) / (2 * cfg.sigma * cfg.sigma));
      const score = d * w;
      if (score > bestScore) {
        bestScore = score;
        bestPt = p;
        bestDark = d;
      }
    }
    if (bestPt) {
      pts.push(bestPt);
      darks.push(bestDark);
    }
  }
  return { pts, darks };
}

// 移動平均で点列の揺れを抑え、~6点へ間引く
function smoothDownsample(pts: Pt[], out = 6): Pt[] {
  if (pts.length <= out) return pts;
  const sm = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    return { x: (a.x + p.x + b.x) / 3, y: (a.y + p.y + b.y) / 3 };
  });
  const res: Pt[] = [];
  for (let i = 0; i < out; i++) {
    res.push(sm[Math.round((i * (sm.length - 1)) / (out - 1))]);
  }
  return res;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0);

/**
 * グレースケール配列から主要4線を抽出（純粋・テスト可能）。
 * lmPx は画像ピクセル座標のランドマーク。
 */
export function extractFromGray(
  gray: Float32Array,
  W: number,
  H: number,
  lmPx: Pt[],
): ExtractResult {
  const { P, toUV, palmW, palmH } = palmFrame(lmPx);
  const I = integralImage(gray, W, H);
  const rBig = Math.max(3, Math.round(palmW * 0.11));
  const rSmall = Math.max(1, Math.round(palmW * 0.012));
  const dark: Tracer = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const d = boxMean(I, W, H, x, y, rBig) - boxMean(I, W, H, x, y, rSmall);
    return d > 0 ? d : 0; // 周囲より暗い＝線らしい
  };

  // 参照：手のひら領域の典型 darkness（しきい値用）
  const refs: number[] = [];
  for (const uu of linspace(-0.3, 1.1, 7)) {
    for (const vv of linspace(0.15, 0.85, 7)) {
      const p = P(uu, vv);
      refs.push(dark(Math.round(p.x), Math.round(p.y)));
    }
  }
  refs.sort((a, b) => a - b);
  const refMedian = refs[Math.floor(refs.length / 2)] || 1;

  const lines: ExtractResult["lines"] = {};
  const features: ExtractResult["features"] = {};
  const confidence: ExtractResult["confidence"] = {};

  (Object.keys(CFG) as (keyof typeof CFG)[]).forEach((key) => {
    const { pts, darks } = traceLine(CFG[key], P, dark);
    const lineMean = mean(darks);
    const ratio = lineMean / (refMedian + 1e-6);
    // 線らしさ：周囲中央値の何倍暗いか
    const conf = Math.max(0, Math.min(1, (ratio - 1.3) / 2));
    confidence[key] = conf;

    const sm = smoothDownsample(pts, 6);
    lines[key] = sm;

    // ── 特徴量の実測（低信頼は standard / absent） ──
    const f: Record<string, string> = {};
    if (conf < 0.25) {
      // 線として弱い → 運命線は absent（生命/知能/感情は標準＝特記なし）
      if (key === "fate_line") f.presence = "absent";
    } else {
      if (key === "fate_line") f.presence = "present";
      // 濃さ
      f.depth = ratio > 2.4 ? "dark" : ratio < 1.7 ? "faint" : "standard";
      // 長さ（線長 / パーム高さ）
      const len = polylineLen(sm) / (palmH || 1);
      f.length = len > 1.05 ? "long" : len < 0.75 ? "short" : "standard";
      // 線ごとの個別特徴
      if (key === "life_line") {
        const cd = curveDeviation(sm);
        f.curve = cd > 0.14 ? "deep" : cd < 0.06 ? "shallow" : "standard";
      }
      if (key === "head_line") {
        const a = toUV(sm[0]);
        const b = toUV(sm[sm.length - 1]);
        const dv = b.v - a.v; // v は下方向（手首側）が正
        f.slope = dv > 0.1 ? "downward" : dv < -0.05 ? "upward" : "straight";
      }
      if (key === "heart_line") {
        const sv = toUV(sm[0]).v;
        f.start_height = sv < 0.12 ? "high" : sv > 0.2 ? "low" : "standard";
      }
    }
    features[key] = f;
  });

  return { lines, features, confidence };
}

function polylineLen(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}
function curveDeviation(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let maxd = 0;
  for (const p of pts) {
    const d = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x) / len;
    if (d > maxd) maxd = d;
  }
  return maxd / len;
}

/** Canvas（正規化後）と正規化ランドマークから主要4線を抽出。ブラウザ専用。 */
export function extractPalmLines(
  canvas: HTMLCanvasElement,
  landmarks: Lm[],
): ExtractResult | null {
  try {
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || W === 0 || H === 0) return null;
    const img = ctx.getImageData(0, 0, W, H).data;
    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      gray[i] = 0.299 * img[o] + 0.587 * img[o + 1] + 0.114 * img[o + 2];
    }
    const lmPx: Pt[] = landmarks.map((p) => ({ x: p.x * W, y: p.y * H }));
    return extractFromGray(gray, W, H, lmPx);
  } catch (e) {
    console.warn("[lineExtraction] failed:", e);
    return null;
  }
}
