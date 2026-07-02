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
  readFingers,
  readHandType,
  type HandTypeReading,
} from "@/lib/diagnosis";
import { detectHandLandmarks, normalizeImage } from "@/lib/handDetect";
import { computeHandMetrics } from "@/lib/handMetrics";
import { LINE_COLOR, LINE_ORDER, isExtra } from "@/lib/rules";
import type { CapturedHand, Hand, LineKey, LineResult, Mode } from "@/lib/types";

/**
 * 結果画面。診断は「特徴量の読み取り（A）」だけで決まる。
 * 写真への線オーバーレイ（B：なぞる／ドラッグ調整）は廃止した（docs/07）。
 */

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
  const mainHand = captured.find((h) => h.hand === main) || captured[0];

  // 診断＝特徴量の読み取りから組み立てる（線の座標は使わない）。
  const { diag, summary, diff } = useMemo(() => {
    const d = diagnoseHand(mainHand.features).filter((r) => !r.absent);
    return {
      diag: d,
      summary: overall(d),
      diff: mode === "both" ? diffText() : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainHand.features, mode]);

  // 表示する線＝特記のある線（standard は出さない＝当たり障りない文で埋めない）。
  const shown: LineResult[] = useMemo(() => {
    const byLine = new Map(diag.map((r) => [r.line, r]));
    return LINE_ORDER.map((k) => byLine.get(k)).filter(Boolean) as LineResult[];
  }, [diag]);

  const [selected, setSelected] = useState<LineKey | null>(null);
  useEffect(() => {
    setSelected((cur) =>
      cur && shown.some((r) => r.line === cur) ? cur : (shown[0]?.line ?? null),
    );
  }, [shown]);

  // 写真は向きだけ正規化して表示（線は重ねない）。
  // あわせて手のランドマークから「手型・指の特徴」を実測（A：AIなしの正直な読み）。
  const [displayUrl, setDisplayUrl] = useState(mainHand.image);
  const [handType, setHandType] = useState<HandTypeReading | null>(null);
  const [fingerNotes, setFingerNotes] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    setDisplayUrl(mainHand.image);
    setHandType(null);
    setFingerNotes([]);
    (async () => {
      const norm = await normalizeImage(mainHand.image);
      if (cancelled || !norm) return;
      setDisplayUrl(norm.url);
      const lm = await detectHandLandmarks(norm.canvas);
      if (cancelled || !lm) return;
      const lmPx = lm.map((p) => ({ x: p.x * norm.width, y: p.y * norm.height }));
      const m = computeHandMetrics(lmPx);
      setHandType(readHandType(m));
      setFingerNotes(readFingers(m));
    })();
    return () => {
      cancelled = true;
    };
  }, [mainHand.image]);

  const sel = shown.find((r) => r.line === selected) || null;
  const combo = sel ? comboFor(sel.def, sel.feats) : null;
  const advice = sel ? adviceFor(sel.def, sel.feats) : [];

  return (
    <section className="card">
      <div className="result-head">
        <div className="axis">{axisFor(mainHand.hand, handedness)}</div>
        <h2>あなたの手相診断</h2>
        <p>
          {shown.length > 0 ? (
            <>
              あなたの手から<b>{shown.length}本</b>
              の特徴的な手相を読み取りました。線をタップすると解説が見られます。
            </>
          ) : (
            <>大きなクセは控えめ。全体のバランスから読み解きます。</>
          )}
        </p>
      </div>

      {/* 手型（手のかたち×指の長さ。ランドマーク実測＝正直な読み） */}
      {handType && (
        <div className="handtype">
          <div className="ht-badge">あなたは〈{handType.name_ja}〉タイプ</div>
          <p>{handType.text}</p>
          {handType.advice && (
            <div className="advice">
              <span className="atag">ひとこと</span>
              {handType.advice}
            </div>
          )}
        </div>
      )}

      {/* 取り込んだ写真（線オーバーレイは廃止） */}
      <div className="photo-wrap">
        <img className="photo" src={displayUrl} alt="あなたの手" />
      </div>

      {/* 線チップ */}
      {shown.length > 0 && (
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
      )}

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

      {/* 指から見るあなた（相対比較は pose 不変で確実） */}
      {fingerNotes.length > 0 && (
        <div className="summary">
          <h3>指から見るあなた</h3>
          <ul>
            {fingerNotes.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
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
