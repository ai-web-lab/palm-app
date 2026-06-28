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

/**
 * MediaPipe(TFLite/glog)が console.error 経由で出す“良性のINFO/WARNINGログ”を
 * console.debug に振り替える。これらは例外ではなく、Next.jsの開発オーバーレイが
 * 誤って「Console Error」として表示してしまうため。実エラーはそのまま通す。
 */
let consolePatched = false;
function quietMediapipeLogs(): void {
  if (consolePatched || typeof console === "undefined") return;
  consolePatched = true;
  const original = console.error.bind(console);
  const benign = [
    "TensorFlow Lite XNNPACK delegate",
    "Created TensorFlow Lite",
    "OpenGL error checking is disabled",
    "landmark_projection_calculator",
    "NORM_RECT without IMAGE_DIMENSIONS",
    "gl_context",
  ];
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (
      typeof first === "string" &&
      (first.startsWith("INFO:") ||
        /^[WIE]\d{4}\s/.test(first) || // glog 形式: W0628 ...
        benign.some((b) => first.includes(b)))
    ) {
      console.debug("[mediapipe]", ...args);
      return;
    }
    original(...args);
  };
}

function getLandmarker(): Promise<HandLandmarker | null> {
  if (!landmarkerPromise) {
    quietMediapipeLogs();
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
  src: HTMLImageElement | HTMLCanvasElement,
): Promise<Pt[] | null> {
  const landmarker = await getLandmarker();
  if (!landmarker) return null;
  try {
    const res = landmarker.detect(src);
    const hand = res.landmarks?.[0];
    if (!hand || hand.length < 21) return null;
    return hand.map((p) => ({ x: p.x, y: p.y }));
  } catch (e) {
    console.warn("[handDetect] detect failed:", e);
    return null;
  }
}

export type NormalizedImage = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** 正規化後の表示用 dataURL（EXIF回転を焼き込み済み）。 */
  url: string;
};

/**
 * dataURL を Canvas に正規化する。スマホ写真等の EXIF 回転をピクセルへ焼き込み、
 * 「表示・検出・座標系」をこの1枚に統一する（座標系の食い違いによるズレを防ぐ）。
 */
export async function normalizeImage(
  dataUrl: string,
): Promise<NormalizedImage | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      bmp = await createImageBitmap(blob);
    }
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      url: canvas.toDataURL("image/jpeg", 0.92),
    };
  } catch (e) {
    console.warn("[handDetect] normalize failed:", e);
    return null;
  }
}
