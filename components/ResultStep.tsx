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
import { detectHandLandmarks, normalizeImage } from "@/lib/handDetect";
import {
  computeLinePoints,
  DEFAULT_LANDMARKS,
  smoothPath,
  type Pt,
} from "@/lib/palmLines";
import { LINE_COLOR, isExtra } from "@/lib/rules";
import type { CapturedHand, Hand, LineKey, Mode } from "@/lib/types";

type LinePoints = Record<LineKey, Pt[]>;
type Geom = { base: LinePoints; w: number; h: number };
type DetectStatus = "loading" | "ok" | "fail";

interface Props {
  handedness: Hand;
  mode: Mode;
  captured: CapturedHand[];
  aiFailed?: boolean;
  onRestart: () => void;
  onRecapture: () => void;
}

const MODE_LABEL: Record<Mode, string> = {
  right: "右手",
  left: "左手",
  both: "両手",
};

const clonePoints = (o: LinePoints): LinePoints =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, v.map((p) => ({ ...p }))]),
  ) as LinePoints;

export default function ResultStep({
  handedness,
  mode,
  captured,
  aiFailed,
  onRestart,
  onRecapture,
}: Props) {
  const main = primaryHand(mode, handedness);
  const mainHand = captured.find((h) => h.hand === main) || captured[0];
  const aiUsed = mainHand.source === "ai";

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

  // 手のランドマーク検出 → 線の初期配置（base）。pts は編集中の点。
  const [status, setStatus] = useState<DetectStatus>("loading");
  const [geom, setGeom] = useState<Geom | null>(null);
  const [pts, setPts] = useState<LinePoints | null>(null);
  const [adjust, setAdjust] = useState(false);
  // 表示画像（EXIF回転を焼き込んだ正規化後）。検出と同じ座標系にそろえる。
  const [displayUrl, setDisplayUrl] = useState(mainHand.image);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setGeom(null);
    setPts(null);
    setAdjust(false);
    setDisplayUrl(mainHand.image);
    (async () => {
      const norm = await normalizeImage(mainHand.image);
      if (cancelled) return;
      const w = norm?.width ?? 300;
      const h = norm?.height ?? 360;
      if (norm) setDisplayUrl(norm.url);
      const lm = norm ? await detectHandLandmarks(norm.canvas) : null;
      if (cancelled) return;
      if (lm) {
        const base = computeLinePoints(lm, w, h);
        setGeom({ base, w, h });
        setPts(clonePoints(base));
        setStatus("ok");
      } else {
        // 検出できなくても、中央に初期配置してドラッグで合わせられるようにする。
        const base = computeLinePoints(DEFAULT_LANDMARKS, 300, 360);
        setGeom({ base, w: 300, h: 360 });
        setPts(clonePoints(base));
        setStatus("fail");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mainHand.image]);

  const sel = diag.find((r) => r.line === selected) || null;
  const combo = sel ? comboFor(sel.def, sel.feats) : null;
  const advice = sel ? adviceFor(sel.def, sel.feats) : [];

  const stroke = geom ? Math.max(geom.w, geom.h) / 150 : 2;

  // 画面座標 → SVGユーザー座標（viewBox/cover を考慮）。
  function toSvg(svg: SVGSVGElement, cx: number, cy: number): Pt | null {
    const p = svg.createSVGPoint();
    p.x = cx;
    p.y = cy;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const r = p.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  }

  function startDrag(e: React.PointerEvent, line: LineKey, idx: number) {
    e.preventDefault();
    e.stopPropagation();
    const svg = (e.target as SVGElement).ownerSVGElement;
    if (!svg) return;
    const onMove = (ev: PointerEvent) => {
      const p = toSvg(svg, ev.clientX, ev.clientY);
      if (!p) return;
      setPts((prev) =>
        prev
          ? { ...prev, [line]: prev[line].map((q, j) => (j === idx ? p : q)) }
          : prev,
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <section className="card">
      <div className="result-head">
        <div className="axis">{axisFor(mainHand.hand, handedness)}</div>
        <h2>あなたの手相診断</h2>
        {aiUsed && (
          <div className="src-badge ai">AIが画像から線の特徴を読み取りました</div>
        )}
        {aiFailed && !aiUsed && (
          <div className="src-badge warn">
            AI解析に失敗したため、参考表示に切り替えました
          </div>
        )}
        <p>
          あなたの手から<b>{diag.length}本</b>
          の手相を読み取りました。線をタップすると解説が見られます。
        </p>
      </div>

      {/* 取り込んだ実画像 ＋ 手に追従させた線オーバーレイ（ドラッグで微調整可） */}
      <div className="photo-wrap">
        <img className="photo" src={displayUrl} alt="あなたの手" />
        {geom && pts && (
          <svg
            className="photo-svg"
            viewBox={`0 0 ${geom.w} ${geom.h}`}
            preserveAspectRatio="xMidYMid slice"
            style={{ touchAction: adjust ? "none" : "auto" }}
          >
            {diag.map((r) => {
              const on = selected === r.line;
              const dim = selected && !on;
              return (
                <path
                  key={r.line}
                  d={smoothPath(pts[r.line])}
                  fill="none"
                  stroke={LINE_COLOR[r.line]}
                  strokeLinecap="round"
                  onClick={() => setSelected(r.line)}
                  style={{
                    cursor: "pointer",
                    strokeWidth: on ? stroke * 1.9 : stroke,
                    opacity: dim ? 0.3 : on ? 1 : 0.9,
                    filter: on
                      ? `drop-shadow(0 0 ${stroke}px currentColor)`
                      : "none",
                    transition: adjust ? "none" : "all .2s",
                  }}
                />
              );
            })}
            {/* 調整モード：選択中の線の制御点をドラッグできる */}
            {adjust &&
              selected &&
              pts[selected]?.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={stroke * 1.8}
                  fill="#fff"
                  stroke={LINE_COLOR[selected]}
                  strokeWidth={stroke * 0.6}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => startDrag(e, selected, i)}
                />
              ))}
          </svg>
        )}
      </div>

      <p className="photo-hint">
        {status === "loading"
          ? "手の形を解析しています…"
          : adjust
            ? "白い点をドラッグして、ご自身の手相線に合わせてください。"
            : status === "ok"
              ? "※ 検出した手の形に合わせて線を表示。ズレる場合は「線を合わせる」で微調整できます。"
              : "※ 手をうまく検出できませんでした。「線を合わせる」で線を手に合わせてください。"}
      </p>

      {/* 半自動：線をドラッグで合わせる */}
      {status !== "loading" && (
        <div className="adjust-bar">
          <button
            className="btn ghost adjust-btn"
            aria-pressed={adjust}
            onClick={() => setAdjust((a) => !a)}
          >
            {adjust ? "調整を終える" : "線を合わせる"}
          </button>
          {adjust && geom && (
            <button
              className="btn ghost adjust-btn"
              onClick={() => setPts(clonePoints(geom.base))}
            >
              リセット
            </button>
          )}
        </div>
      )}

      {/* 線チップ */}
      <div className="linechips">
        {diag.map((r) => (
          <button
            key={r.line}
            className={"lchip" + (isExtra(r.def) ? " extra" : "")}
            aria-pressed={selected === r.line}
            onClick={() => setSelected(r.line)}
          >
            <span className="cdot" style={{ background: LINE_COLOR[r.line] }} />
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
            <span className="sw" style={{ background: LINE_COLOR[sel.line] }} />
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
