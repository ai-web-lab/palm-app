export type LineKey =
  | "life_line"
  | "head_line"
  | "heart_line"
  | "fate_line"
  | "sun_line"
  | "money_line"
  | "marriage_line";

export type Hand = "left" | "right";
export type Mode = "left" | "right" | "both";

/** 線ごとの特徴量。値は enum 文字列（length="long" 等）。standard は診断文を出さない。 */
export type Features = Record<string, string>;

/** 特徴量の出所。ai=LLM抽出 / mock=ランダム生成。 */
export type FeatureSource = "ai" | "mock";

/** 手1枚分の入力。image は dataURL（撮影 or アップロードした実画像）。 */
export interface CapturedHand {
  hand: Hand;
  image: string;
  features: Record<LineKey, Features>;
  source: FeatureSource;
}

/** 1線分の診断結果。 */
export interface LineResult {
  line: LineKey;
  /** palm_rules.json の lines[line] 定義（文言の正本）。 */
  def: LineDef;
  feats: Features;
  texts: string[];
  absent: boolean;
}

export interface LineRule {
  feature: string;
  value: string;
  interpretation: string;
}

export interface LineCombo {
  when: Record<string, string>;
  text: string;
}

export interface LineDef {
  name_ja: string;
  theme: string;
  group?: string;
  rules?: LineRule[];
  combos?: LineCombo[];
  advice?: Record<string, string>;
  [key: string]: unknown;
}
