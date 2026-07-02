"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Hand } from "@/lib/types";

type Tab = "camera" | "upload";

interface Props {
  hand: Hand;
  /** 例：「（1/2）」。片手なら空文字。 */
  stepLabel: string;
  total: number;
  isFirst: boolean;
  /** 1枚取り込めたら画像(dataURL)を渡す。特徴量生成と画面遷移は親が行う。 */
  onComplete: (image: string) => void;
  onBack: () => void;
}

export default function CaptureStep({
  hand,
  stepLabel,
  total,
  isFirst,
  onComplete,
  onBack,
}: Props) {
  const [tab, setTab] = useState<Tab>("camera");
  const [shot, setShot] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handLabel = hand === "right" ? "右手" : "左手";

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCamError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCamError("このブラウザはカメラに対応していません。画像アップロードをご利用ください。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setCamError(
        "カメラを起動できませんでした。権限を確認するか、画像アップロードをご利用ください。",
      );
    }
  }, []);

  // カメラタブ かつ 未撮影 のときだけカメラを起動。
  useEffect(() => {
    if (tab === "camera" && !shot && !scanning) {
      startCamera();
    } else {
      stopCamera();
    }
    return stopCamera;
  }, [tab, shot, scanning, startCamera, stopCamera]);

  // スキャン演出をはさんで完了。
  const runScan = useCallback(
    (image: string) => {
      setShot(image);
      setScanning(true);
      stopCamera();
      const id = setTimeout(() => onComplete(image), 2200);
      return () => clearTimeout(id);
    },
    [onComplete, stopCamera],
  );

  const captureFromCamera = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setCamError("映像の準備ができていません。少し待ってからもう一度お試しください。");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    runScan(canvas.toDataURL("image/jpeg", 0.9));
  }, [runScan]);

  const readFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setCamError("画像ファイルを選んでください。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setShot(String(reader.result));
    reader.readAsDataURL(file);
  }, []);

  const switchTab = (t: Tab) => {
    if (scanning) return;
    setTab(t);
    setShot(null);
    setCamError(null);
  };

  return (
    <section className="card">
      <h2>
        {handLabel}のひらを撮影
        {stepLabel}
      </h2>
      <p className="sub">
        {total > 1
          ? `${isFirst ? "まず" : "続いて"}${handLabel}を。手のひらを正面に向け、指を軽く開いて大きく写してください。`
          : `${handLabel}のひらを正面に向け、指を軽く開いて画面に大きく写してください。`}
      </p>

      <div className="tabs" role="tablist">
        <button
          className="tab"
          role="tab"
          aria-selected={tab === "camera"}
          onClick={() => switchTab("camera")}
        >
          カメラで撮影
        </button>
        <button
          className="tab"
          role="tab"
          aria-selected={tab === "upload"}
          onClick={() => switchTab("upload")}
        >
          画像をアップロード
        </button>
      </div>

      <div className="scan">
        <div className={`scan-frame${scanning ? " scanning" : ""}`}>
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner bl" />
          <span className="corner br" />
          <span className="scanline" />

          {/* 背景：ライブ映像 or 取り込んだ画像 */}
          {tab === "camera" && !shot && (
            <video ref={videoRef} playsInline muted />
          )}
          {shot && <img className="shot" src={shot} alt="取り込んだ手の画像" />}
          {/* 手形ガイドは廃止（合わせづらいため）。手を自動検出するので厳密な位置合わせは不要。 */}

          {/* アップロードタブ・未選択時のドロップゾーン */}
          {tab === "upload" && !shot && (
            <div
              className={`dropzone${dragging ? " drag" : ""}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) readFile(f);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                  stroke="#9aa2c8"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>タップ、またはドラッグ&ドロップで画像を選択</span>
            </div>
          )}

        </div>

        <div className="scan-hint">
          {scanning
            ? "手相を読み取っています…"
            : tab === "camera"
              ? `${handLabel}をかざしてください`
              : shot
                ? "この画像で占えます"
                : `${handLabel}の写真を選んでください`}
        </div>
        {camError && <div className="cam-error">{camError}</div>}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="nav">
        <button className="btn ghost" onClick={onBack} disabled={scanning}>
          戻る
        </button>
        {tab === "camera" ? (
          <button
            className="btn primary"
            onClick={captureFromCamera}
            disabled={scanning || !!camError}
          >
            {scanning ? "読み取り中…" : "撮影して占う"}
          </button>
        ) : (
          <button
            className="btn primary"
            onClick={() => shot && runScan(shot)}
            disabled={scanning || !shot}
          >
            {scanning ? "読み取り中…" : "この画像で占う"}
          </button>
        )}
      </div>
    </section>
  );
}
