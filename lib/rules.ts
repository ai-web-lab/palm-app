import rulesData from "@/data/palm_rules.json";
import type { LineDef, LineKey } from "./types";

/**
 * 知識ベース（palm_rules.json）を唯一の正本として読み込む。
 * 鉄則：診断の文言はここにしか持たない。コードは色・座標などの「見た目」だけを持つ。
 */
export const RULES = rulesData as unknown as {
  lines: Record<LineKey, LineDef>;
  [key: string]: unknown;
};

export const LINE_ORDER: LineKey[] = [
  "life_line",
  "head_line",
  "heart_line",
  "fate_line",
  "sun_line",
  "money_line",
  "marriage_line",
];

/** 線ごとの固有色（見た目の情報なのでコード側に持つ）。 */
export const LINE_COLOR: Record<LineKey, string> = {
  life_line: "#d9b36b",
  head_line: "#8ab4d9",
  heart_line: "#c98a8a",
  fate_line: "#9a86c9",
  sun_line: "#e0c060",
  money_line: "#7fbf9a",
  marriage_line: "#cf9ec0",
};

/**
 * 結果オーバーレイ用の線パス（viewBox 0 0 300 360）。
 * ※ これはあくまで「イメージ図」。実際の線検出は未実装のため固定座標。
 */
export const LINE_PATH: Record<LineKey, string> = {
  life_line: "M 108 238 C 88 250 78 282 80 308 C 82 330 90 346 102 350",
  head_line: "M 110 244 C 134 254 162 262 184 274",
  heart_line: "M 196 250 C 168 236 130 232 106 242",
  fate_line: "M 150 350 C 148 300 146 262 142 230",
  sun_line: "M 168 256 C 166 234 165 216 164 198",
  money_line: "M 188 250 C 188 232 188 216 188 202",
  marriage_line: "M 198 232 L 214 228",
};

/** 撮影ガイド/結果で使う手のひら輪郭（viewBox 0 0 300 360）。 */
export const PALM_PATH =
  "M 112 352 C 104 322 100 300 100 280 C 82 286 60 286 46 276 C 34 267 34 254 46 250 C 58 246 74 250 88 256 C 72 244 56 230 50 216 C 46 206 56 198 66 206 C 78 216 90 232 98 244 C 86 220 74 188 70 168 C 67 154 80 150 86 164 C 94 184 100 210 106 228 C 102 196 96 150 96 120 C 96 105 110 105 113 120 C 117 148 116 192 118 222 L 122 222 C 122 186 124 132 130 110 C 133 96 147 96 149 112 C 151 142 144 190 142 224 L 147 224 C 152 190 162 144 170 124 C 175 110 189 113 187 130 C 184 160 172 198 162 226 C 172 206 186 180 198 168 C 207 159 219 166 213 180 C 205 200 188 232 176 256 C 188 264 196 276 198 292 C 200 312 196 334 190 352 Z";

/** extra3線（太陽線・財運線・結婚線）判定。group が "extra*" のものを extra とみなす。 */
export function isExtra(def: LineDef): boolean {
  return typeof def.group === "string" && def.group.startsWith("extra");
}
