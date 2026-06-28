import type { Features, LineKey } from "./types";

/**
 * LLM特徴量抽出のクライアント呼び出し。
 * 画像(dataURL)を /api/diagnose に送り、線の特徴量を受け取る。
 * 失敗時は例外を投げる（呼び出し側でモックにフォールバック）。
 */
export async function fetchAIFeatures(
  imageDataUrl: string,
): Promise<Record<LineKey, Features>> {
  const res = await fetch("/api/diagnose", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
  });
  if (!res.ok) {
    throw new Error(`ai_features_failed_${res.status}`);
  }
  const data = (await res.json()) as { features?: Record<LineKey, Features> };
  if (!data.features) throw new Error("ai_features_empty");
  return data.features;
}
