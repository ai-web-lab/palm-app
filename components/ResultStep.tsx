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
import { extractPalmLines } from "@/lib/lineExtraction";
import {
  computeLinePoints,
  DEFAULT_LANDMARKS,
  smoothPath,
  type Pt,
} from "@/lib/palmLines";
import { LINE_COLOR, LINE_ORDER, RULES, isExtra } from "@/lib/rules";
import type {
  CapturedHand,
  Hand,
  LineKey,
  LineResult,
  Mode,
} from "@/lib/types";

/** CVで安定して検出する基本4線。検出できたら解説が無くても線を描く。 */
const BASE4: LineKey[] = ["life_line", "head_line", "heart_line", "fate_line"];

type LinePoints = Record<LineKey, Pt[]>;
type Geom = { base: LinePoints; w: number; h: number };
type DetectStatus = "loading" | "ok" | "fail" | "ai" | "cv";

/** 実線抽出を採用する信頼度しきい値。 */
const CV_THRESHOLD = 0.4;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

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
  // 表示・診断に使う実効特徴量。初期はキャプチャ時のもの(AI or モック)。
  // CV検出後に「実際に検出できた線の特徴」で上書きし、表示する線を決定論的にする。
  const [effFeatures, setEffFeatures] = useState(mainHand.features);
  const [diagSource, setDiagSource] = useState<"ai" | "cv" | "mock">(
    mainHand.source === "ai" ? "ai" : "mock",
  );
  const aiUsed = diagSource === "ai";
  const cvUsed = diagSource === "cv";

  const { diag, summary, diff } = useMemo(() => {
    const d = diagnoseHand(effFeatures).filter((r) => !r.absent);
    return {
      diag: d,
      summary: overall(d),
      diff: mode === "both" ? diffText() : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effFeatures, mode]);

  // 実際に検出できた基本線（CV信頼度≥しきい値 or AIが座標を返した線）。
  // 解説の有無に関係なく描画・チップ表示する。
  const [detected, setDetected] = useState<LineKey[]>([]);

  // 表示する線＝「特記のある線(diag)」∪「検出できた基本線」。特記が無い線も描く。
  const shown: LineResult[] = useMemo(() => {
    const byLine = new Map(diag.map((r) => [r.line, r]));
    const list: LineResult[] = [];
    for (const k of LINE_ORDER) {
      const r = byLine.get(k);
      if (r) list.push(r);
      else if (detected.includes(k)) {
        list.push({ line: k, def: RULES.lines[k], feats: effFeatures[k] ?? {}, texts: [], absent: false });
      }
    }
    return list;
  }, [diag, detected, effFeatures]);

  const [selected, setSelected] = useState<LineKey | null>(null);
  // 表示集合が変わっても選択が有効な線を指すように保つ
  useEffect(() => {
    setSelected((cur) =>
      cur && shown.some((r) => r.line === cur) ? cur : (shown[0]?.line ?? null),
    );
  }, [shown]);

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

      // 線の初期配置の優先順位：
      //   実線抽出(CV, 信頼度≥しきい値) > AI推定座標 > MediaPipeテンプレ追従 > 中央デフォルト
      const gw = norm ? w : 300;
      const gh = norm ? h : 360;
      const template = computeLinePoints(lm ?? DEFAULT_LANDMARKS, gw, gh);
      const ai = mainHand.aiLines;
      // CVは正規化済みCanvas＋ランドマークが必要（座標は画像px＝gw×gh と同じ系）
      const cv = lm && norm ? extractPalmLines(norm.canvas, lm) : null;

      let usedAI = false;
      let usedCV = false;
      const base = {} as LinePoints;
      const detKeys: LineKey[] = [];
      for (const key of LINE_ORDER) {
        const cvPts = cv?.lines[key];
        const cvConf = cv?.confidence[key] ?? 0;
        const a = ai?.[key];
        if (cvPts && cvPts.length >= 2 && cvConf >= CV_THRESHOLD) {
          base[key] = cvPts; // すでに画像px
          usedCV = true;
          if (BASE4.includes(key)) detKeys.push(key);
        } else if (a && a.length >= 2) {
          base[key] = a.map((p) => ({ x: clamp01(p.x) * gw, y: clamp01(p.y) * gh }));
          usedAI = true;
          if (BASE4.includes(key)) detKeys.push(key);
        } else {
          base[key] = template[key];
        }
      }
      setDetected(detKeys);
      setGeom({ base, w: gw, h: gh });
      setPts(clonePoints(base));
      setStatus(usedCV ? "cv" : usedAI ? "ai" : lm ? "ok" : "fail");

      // 診断に使う特徴量の優先順位：AI(同意時) > CV(検出時の実測) > モック。
      // CVを使う場合、表示する線は「実際に検出できた線」になり毎回同じ（決定論的）。
      if (mainHand.source === "ai") {
        setEffFeatures(mainHand.features);
        setDiagSource("ai");
      } else if (cv) {
        // CVが扱うのは基本4線。extra3はCV非対象なので absent に固定（モックの揺れを排除）。
        const merged = {} as typeof mainHand.features;
        for (const key of LINE_ORDER) {
          merged[key] = cv.features[key] ?? { presence: "absent" };
        }
        setEffFeatures(merged);
        setDiagSource("cv");
      } else {
        setEffFeatures(mainHand.features);
        setDiagSource("mock");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mainHand.image]);

  const sel = shown.find((r) => r.line === selected) || null;
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
        {cvUsed && (
          <div className="src-badge ai">
            画像から検出した線の特徴で診断しました（試験的）
          </div>
        )}
        {aiFailed && !aiUsed && (
          <div className="src-badge warn">
            AI解析に失敗したため、参考表示に切り替えました
          </div>
        )}
        <p>
          あなたの手から<b>{shown.length}本</b>
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
            {shown.map((r) => {
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
            : status === "cv"
              ? "※ 画像から手相線を検出しました（試験的）。ズレる場合は「線を合わせる」で微調整できます。"
              : status === "ai"
                ? "※ AIが画像から線の位置を推定しました。ズレる場合は「線を合わせる」で微調整できます。"
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
        {shown.map((r) => (
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
            {sel.texts.length > 0 ? (
              sel.texts.map((t, i) => <li key={i}>{t}</li>)
            ) : combo ? null : (
              <li>
                目立ったクセは控えめで、バランスのとれた{sel.def.theme}の持ち主です。
              </li>
            )}
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
