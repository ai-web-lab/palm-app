import type { HandLandmarker } from "@mediapipe/tasks-vision";
import type { Pt } from "./palmLines";

/**
 * MediaPipe Hands（HandLandmarker）で手の21ランドマークを検出する。
 * - モデル/WASM は CDN から取得（コードであり、ユーザーの手画像ではない）。
 * - 画像自体はブラウザ内で処理し、外部送信しない（プライバシー方針を維持）。
 * - 取得失敗時は null を返し、呼び出し側は固定オーバーレイにフォールバックする。
 */

// WASM は public/mediapipe/wasm に自前ホスト（prebuild/predin で node_modules からコピー）。
// → 外部CDN(jsdelivr)に依存せず、オフラインでも動く。
const WASM_URL = "/mediapipe/wasm";
// モデルは安定した公式CDNから取得（コードであり、ユーザーの手画像ではない）。
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let landmarkerPromise: Promise<HandLandmarker | null> | null = null;

function getLandmarker(): Promise<HandLandmarker | null> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
        return await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL },
          numHands: 1,
          runningMode: "IMAGE",
        });
      } catch (e) {
        console.warn("[handDetect] HandLandmarker init failed:", e);
        return null;
      }
    })();
  }
  return landmarkerPromise;
}

/** 画像から21点ランドマーク（正規化座標）を返す。検出できなければ null。 */
export async function detectHandLandmarks(
  img: HTMLImageElement,
): Promise<Pt[] | null> {
  const landmarker = await getLandmarker();
  if (!landmarker) return null;
  try {
    const res = landmarker.detect(img);
    const hand = res.landmarks?.[0];
    if (!hand || hand.length < 21) return null;
    return hand.map((p) => ({ x: p.x, y: p.y }));
  } catch (e) {
    console.warn("[handDetect] detect failed:", e);
    return null;
  }
}
