import type { Features, LineKey } from "./types";
import type { Pt } from "./palmLines";

export type AIReading = {
  features: Record<LineKey, Features>;
  /** 各線の正規化座標（0..1）。AIが推定した線の位置。無い線は空配列。 */
  lines: Partial<Record<LineKey, Pt[]>>;
};

/**
 * LLM特徴量＋線位置の抽出。画像(dataURL)を /api/diagnose に送る。
 * 失敗時は例外を投げる（呼び出し側でモックにフォールバック）。
 */
export async function fetchAIReading(imageDataUrl: string): Promise<AIReading> {
  const res = await fetch("/api/diagnose", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
  });
  if (!res.ok) {
    throw new Error(`ai_reading_failed_${res.status}`);
  }
  const data = (await res.json()) as Partial<AIReading>;
  if (!data.features) throw new Error("ai_reading_empty");
  return { features: data.features, lines: data.lines ?? {} };
}
