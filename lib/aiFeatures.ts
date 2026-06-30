import type { Features, Hand, LineKey } from "./types";

export type AIReading = {
  features: Record<LineKey, Features>;
};

/**
 * LLM特徴量の読み取り。画像(dataURL)を /api/diagnose に送る。
 * hand を渡すと、AIが左右（親指の向き）を踏まえて読み取れる。
 * 失敗時は例外を投げる（呼び出し側でモックにフォールバック）。
 * ※ 線の座標(なぞる=B)は廃止。特徴量(A)のみ取得する。
 */
export async function fetchAIReading(
  imageDataUrl: string,
  hand?: Hand,
): Promise<AIReading> {
  const res = await fetch("/api/diagnose", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl, hand }),
  });
  if (!res.ok) {
    throw new Error(`ai_reading_failed_${res.status}`);
  }
  const data = (await res.json()) as Partial<AIReading>;
  if (!data.features) throw new Error("ai_reading_empty");
  return { features: data.features };
}
