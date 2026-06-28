"use client";

import { useEffect, useMemo, useState } from "react";
import {
  adviceFor,
  axisFor,
  comboFor,
  diagnoseHand,
  diffText,
  overall,
  primaryHand,
} from "@/lib/diagnosis";
import { detectHandLandmarks } from "@/lib/handDetect";
import { computeLinePaths } from "@/lib/palmLines";
import { LINE_COLOR, LINE_PATH, isExtra } from "@/lib/rules";
import type { CapturedHand, Hand, LineKey, Mode } from "@/lib/types";

type Detection = {
  paths: Record<LineKey, string>;
  natW: number;
  natH: number;
};
type DetectStatus = "loading" | "ok" | "fail";

interface Props {
  handedness: Hand;
  mode: Mode;
  captured: CapturedHand[];
  onRestart: () => void;
  onRecapture: () => void;
}

const MODE_LABEL: Record<Mode, string> = {
  right: "右手",
  left: "左手",
  both: "両手",
};

export default function ResultStep({
  handedness,
  mode,
  captured,
  onRestart,
  onRecapture,
}: Props) {
  const main = primaryHand(mode, handedness);
  const mainHand =
    captured.find((h) => h.hand === main) || captured[0];

  // 描画のたびに乱数で揺れないよう一度だけ算出。
  const { diag, summary, diff } = useMemo(() => {
    const d = diagnoseHand(mainHand.features).filter((r) => !r.absent);
    return {
      diag: d,
      summary: overall(d),
      diff: mode === "both" ? diffText() : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainHand]);

  const [selected, setSelected] = useState<LineKey | null>(
    diag.length ? diag[0].line : null,
  );

  // 手のランドマークを検出し、線を実際の手に追従させる。
  const [detect, setDetect] = useState<Detection | null>(null);
  const [status, setStatus] = useState<DetectStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setDetect(null);
    const img = new Image();
    img.onload = async () => {
      const lm = await detectHandLandmarks(img);
      if (cancelled) return;
      if (lm && img.naturalWidth && img.naturalHeight) {
        setDetect({
          paths: computeLinePaths(lm, img.naturalWidth, img.naturalHeight),
          natW: img.naturalWidth,
          natH: img.naturalHeight,
        });
        setStatus("ok");
      } else {
        setStatus("fail");
      }
    };
    img.onerror = () => !cancelled && setStatus("fail");
    img.src = mainHand.image;
    return () => {
      cancelled = true;
    };
  }, [mainHand.image]);

  const flip = mainHand.hand === "left";
  const sel = diag.find((r) => r.line === selected) || null;
  const combo = sel ? comboFor(sel.def, sel.feats) : null;
  const advice = sel ? adviceFor(sel.def, sel.feats) : [];

  return (
    <section className="card">
      <div className="result-head">
        <div className="axis">{axisFor(mainHand.hand, handedness)}</div>
        <h2>あなたの手相診断</h2>
        <p>
          あなたの手から<b>{diag.length}本</b>
          の手相を読み取りました。線をタップすると解説が見られます。
        </p>
      </div>

      {/* 取り込んだ実画像 ＋ 手に追従させた線オーバーレイ */}
      <div className="photo-wrap">
        <img className="photo" src={mainHand.image} alt="あなたの手" />
        {detect && status === "ok" ? (
          // 検出成功：手のランドマークに合わせた線（画像ピクセル座標系）
          <svg
            className="photo-svg"
            viewBox={`0 0 ${detect.natW} ${detect.natH}`}
            preserveAspectRatio="xMidYMid slice"
          >
            {diag.map((r) => {
              const base = Math.max(detect.natW, detect.natH) / 150;
              const on = selected === r.line;
              const dim = selected && !on;
              return (
                <path
                  key={r.line}
                  d={detect.paths[r.line]}
                  fill="none"
                  stroke={LINE_COLOR[r.line]}
                  strokeLinecap="round"
                  onClick={() => setSelected(r.line)}
                  style={{
                    cursor: "pointer",
                    strokeWidth: on ? base * 1.9 : base,
                    opacity: dim ? 0.3 : on ? 1 : 0.9,
                    filter: on ? `drop-shadow(0 0 ${base}px currentColor)` : "none",
                    transition: "all .2s",
                  }}
                />
              );
            })}
          </svg>
        ) : (
          // フォールバック：固定座標（検出前/失敗時）
          <svg
            className="photo-svg"
            viewBox="0 0 300 360"
            preserveAspectRatio="xMidYMid slice"
          >
            <g transform={flip ? "translate(300,0) scale(-1,1)" : ""}>
              {diag.map((r) => (
                <path
                  key={r.line}
                  className={
                    "pline" +
                    (selected === r.line ? " sel" : "") +
                    (selected && selected !== r.line ? " dim" : "")
                  }
                  d={LINE_PATH[r.line]}
                  fill="none"
                  stroke={LINE_COLOR[r.line]}
                  strokeLinecap="round"
                  onClick={() => setSelected(r.line)}
                />
              ))}
            </g>
          </svg>
        )}
      </div>
      <p className="photo-hint">
        {status === "loading"
          ? "手の形を解析しています…"
          : status === "ok"
            ? "※ 検出した手の形に合わせて線の目安を表示しています（線そのものの自動検出は精度向上中）。"
            : "※ 手をうまく検出できませんでした。線の位置はイメージです（手を枠いっぱい・明るい場所で撮ると精度が上がります）。"}
      </p>

      {/* 線チップ */}
      <div className="linechips">
        {diag.map((r) => (
          <button
            key={r.line}
            className={"lchip" + (isExtra(r.def) ? " extra" : "")}
            aria-pressed={selected === r.line}
            onClick={() => setSelected(r.line)}
          >
            <span
              className="cdot"
              style={{ background: LINE_COLOR[r.line] }}
            />
            {r.def.name_ja}
          </button>
        ))}
      </div>

      {/* 選択中の線の解説 */}
      {sel && (
        <div
          className="rcard"
          style={{ borderLeftColor: LINE_COLOR[sel.line], marginBottom: 16 }}
        >
          <h4>
            <span
              className="sw"
              style={{ background: LINE_COLOR[sel.line] }}
            />
            {sel.def.name_ja}
            <span className="pill">{sel.def.theme}</span>
          </h4>
          {combo && <p className="deepread">{combo}</p>}
          <ul>
            {sel.texts.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          {sel.line === "marriage_line" && (
            <div className="when">
              結婚の時期：線の位置から、30代前半ごろにご縁の高まりが読み取れます（※流派により目盛りは異なります）。
            </div>
          )}
          {advice.length > 0 && (
            <div className="advice">
              <span className="atag">ひとこと</span>
              {advice.join(" ")}
            </div>
          )}
        </div>
      )}

      {/* 総合 */}
      <div className="summary">
        <h3>総合</h3>
        <p>{summary}</p>
      </div>
      {diff && (
        <div className="summary">
          <h3>左右のちがい</h3>
          <p>{diff}</p>
        </div>
      )}

      <div className="disc">
        これは手相学にもとづく娯楽目的の診断です。寿命・健康・結婚などを断定するものではありません。
        <br />
        採用した見方：利き手（{handedness === "right" ? "右" : "左"}利き）／
        {MODE_LABEL[mode]}
      </div>

      <div className="nav" style={{ maxWidth: 380 }}>
        <button className="btn ghost" onClick={onRestart}>
          最初から
        </button>
        <button className="btn primary" onClick={onRecapture}>
          もう一度占う
        </button>
      </div>
    </section>
  );
}
