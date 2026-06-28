import type { LineKey } from "./types";

/**
 * 手のランドマーク（MediaPipe Hands の21点）に合わせて、手相線テンプレートを
 * アフィン変換して配置する。これにより線が「写真の手」に追従する。
 *
 * ※ 実際の線そのものを画像から検出しているわけではない（位置の目安）。
 *   真の線抽出は将来の課題（docs/07）。
 */

export type Pt = { x: number; y: number };

// テンプレート空間（右手・手のひら向き、y下方向, 0..100 の目安座標）。
// 3つのアンカー（手首・人差し指付け根・小指付け根）で実画像へアフィン写像する。
const ANCHOR = {
  wrist: [50, 92] as [number, number], // landmark 0
  index: [33, 28] as [number, number], // landmark 5
  pinky: [72, 30] as [number, number], // landmark 17
};

// 各線をテンプレート空間の点列で定義（滑らかな曲線として描画）。
const TEMPLATE: Record<LineKey, [number, number][]> = {
  // 生命線：親指の付け根をぐるりと回り手首へ
  life_line: [
    [33, 46],
    [26, 56],
    [23, 70],
    [28, 84],
    [36, 89],
  ],
  // 知能線：親指側から手のひら中央へ横切る
  head_line: [
    [31, 50],
    [42, 53],
    [54, 55],
    [63, 56],
  ],
  // 感情線：指の付け根の下を小指側から人差し指側へ
  heart_line: [
    [72, 40],
    [62, 35],
    [50, 35],
    [40, 41],
    [33, 46],
  ],
  // 運命線：手首から中指付け根へ縦に
  fate_line: [
    [50, 88],
    [50, 68],
    [50, 48],
    [50, 30],
  ],
  // 太陽線：薬指の下（短い縦線）
  sun_line: [
    [58, 42],
    [58, 34],
  ],
  // 財運線：小指寄りの縦線
  money_line: [
    [65, 43],
    [65, 35],
  ],
  // 結婚線：小指の側面の短い横線
  marriage_line: [
    [74, 40],
    [80, 37],
  ],
};

/** テンプレート3点 → 画像3点 のアフィン変換を解いて変換関数を返す。 */
function affineFromTriangles(
  src: [number, number][],
  dst: Pt[],
): (p: [number, number]) => Pt {
  const [[x1, y1], [x2, y2], [x3, y3]] = src;
  const det = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);
  const coeffs = (v1: number, v2: number, v3: number) => {
    const a = (v1 * (y2 - y3) - y1 * (v2 - v3) + (v2 * y3 - v3 * y2)) / det;
    const b = (x1 * (v2 - v3) - v1 * (x2 - x3) + (x2 * v3 - x3 * v2)) / det;
    const c =
      (x1 * (y2 * v3 - y3 * v2) -
        y1 * (x2 * v3 - x3 * v2) +
        v1 * (x2 * y3 - x3 * y2)) /
      det;
    return [a, b, c] as const;
  };
  const [a, b, c] = coeffs(dst[0].x, dst[1].x, dst[2].x);
  const [d, e, f] = coeffs(dst[0].y, dst[1].y, dst[2].y);
  return (p) => ({ x: a * p[0] + b * p[1] + c, y: d * p[0] + e * p[1] + f });
}

/** 点列を Catmull-Rom で滑らかな SVG パス文字列にする。 */
export function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  const f = (n: number) => n.toFixed(1);
  if (pts.length === 2) {
    return `M ${f(pts[0].x)} ${f(pts[0].y)} L ${f(pts[1].x)} ${f(pts[1].y)}`;
  }
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/**
 * 21点ランドマーク（正規化座標 0..1）と画像の実寸から、各線の制御点列を生成。
 * 返す点は画像のピクセル座標系（viewBox = 0 0 natW natH 用）。
 * 点列にしておくことで、ユーザーがドラッグして自分の手相線に合わせられる（半自動）。
 */
export function computeLinePoints(
  landmarks: Pt[],
  natW: number,
  natH: number,
): Record<LineKey, Pt[]> {
  const px = (i: number): Pt => ({
    x: landmarks[i].x * natW,
    y: landmarks[i].y * natH,
  });
  const affine = affineFromTriangles(
    [ANCHOR.wrist, ANCHOR.index, ANCHOR.pinky],
    [px(0), px(5), px(17)],
  );
  const out = {} as Record<LineKey, Pt[]>;
  (Object.keys(TEMPLATE) as LineKey[]).forEach((key) => {
    out[key] = TEMPLATE[key].map(affine);
  });
  return out;
}

/**
 * 手を検出できなかったときの既定ランドマーク（正規化）。
 * 画面中央に手があると仮定して線を初期配置し、ユーザーがドラッグで合わせる。
 * 使うのは 0(手首)/5(人差し指付け根)/17(小指付け根) のみ。
 */
export const DEFAULT_LANDMARKS: Pt[] = Array.from({ length: 21 }, () => ({
  x: 0.5,
  y: 0.5,
}));
DEFAULT_LANDMARKS[0] = { x: 0.5, y: 0.95 };
DEFAULT_LANDMARKS[5] = { x: 0.36, y: 0.33 };
DEFAULT_LANDMARKS[17] = { x: 0.66, y: 0.36 };
