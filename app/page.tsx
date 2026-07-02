"use client";

import { useEffect, useState } from "react";
import CaptureStep from "@/components/CaptureStep";
import ResultStep from "@/components/ResultStep";
import { LINE_ORDER } from "@/lib/rules";
import type { CapturedHand, Features, Hand, LineKey, Mode } from "@/lib/types";

/** 未測定の空の特徴量。実測は結果画面(ResultStep)で行うため初期は空。 */
const emptyFeatures = (): Record<LineKey, Features> =>
  Object.fromEntries(LINE_ORDER.map((k) => [k, {} as Features])) as Record<
    LineKey,
    Features
  >;

type OptionDef<T extends string> = {
  v: T;
  title: string;
  desc: string;
  icon: React.ReactNode;
};

const HANDEDNESS_OPTS: OptionDef<Hand>[] = [
  {
    v: "right",
    title: "右利き",
    desc: "右手で字を書く・箸を持つ",
    icon: (
      <path
        d="M8 13V5a1.5 1.5 0 013 0v6m0-1a1.5 1.5 0 013 0v1m0 0a1.5 1.5 0 013 0v4a6 6 0 01-6 6h-1.5a5 5 0 01-4.2-2.3L6 18c-1-1.5.8-3 2-1.8l1 1"
        stroke="#9aa2c8"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    v: "left",
    title: "左利き",
    desc: "左手で字を書く・箸を持つ",
    icon: (
      <path
        d="M16 13V5a1.5 1.5 0 00-3 0v6m0-1a1.5 1.5 0 00-3 0v1m0 0a1.5 1.5 0 00-3 0v4a6 6 0 006 6h1.5a5 5 0 004.2-2.3L18 18c1-1.5-.8-3-2-1.8l-1 1"
        stroke="#9aa2c8"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

const MODE_OPTS: OptionDef<Mode>[] = [
  {
    v: "right",
    title: "右手",
    desc: "いまの自分・これからを見る（手軽）",
    icon: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="3" stroke="#9aa2c8" strokeWidth="1.6" />
        <path d="M12 7v6" stroke="#9aa2c8" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    v: "left",
    title: "左手",
    desc: "生まれ持った本質・素質を見る",
    icon: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="3" stroke="#9aa2c8" strokeWidth="1.6" />
        <path d="M9 7h6" stroke="#9aa2c8" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    v: "both",
    title: "両手",
    desc: "本式・右手と左手を1枚ずつ撮影",
    icon: (
      <>
        <rect x="2" y="4" width="9" height="16" rx="2.5" stroke="#9aa2c8" strokeWidth="1.6" />
        <rect x="13" y="4" width="9" height="16" rx="2.5" stroke="#9aa2c8" strokeWidth="1.6" />
      </>
    ),
  },
];

function OptionList<T extends string>({
  opts,
  value,
  onChange,
}: {
  opts: OptionDef<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="opts">
      {opts.map((o) => (
        <button
          key={o.v}
          className="opt"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
        >
          <span className="ic">
            <svg viewBox="0 0 24 24" fill="none">
              {o.icon}
            </svg>
          </span>
          <span className="tx">
            <b>{o.title}</b>
            <span>{o.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const [step, setStep] = useState(0);
  const [handedness, setHandedness] = useState<Hand>("right");
  const [mode, setMode] = useState<Mode>("right");
  const [scanIdx, setScanIdx] = useState(0);
  const [captured, setCaptured] = useState<CapturedHand[]>([]);

  const scanQueue: Hand[] = mode === "both" ? ["right", "left"] : [mode];

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step, scanIdx]);

  const startCapture = () => {
    setScanIdx(0);
    setCaptured([]);
    setStep(2);
  };

  // 手相判定は端末内で完結（知識ベース）。撮影画像は保存せずメモリ上で扱う。
  const handleComplete = (image: string) => {
    const hand = scanQueue[scanIdx];
    const next: CapturedHand[] = [
      ...captured,
      { hand, image, features: emptyFeatures(), source: "mock" },
    ];
    setCaptured(next);
    if (scanIdx < scanQueue.length - 1) {
      setScanIdx(scanIdx + 1);
    } else {
      setStep(3);
    }
  };

  const restart = () => {
    setHandedness("right");
    setMode("right");
    setScanIdx(0);
    setCaptured([]);
    setStep(0);
  };

  const total = scanQueue.length;
  const stepLabel = total > 1 ? `（${scanIdx + 1}/${total}）` : "";

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          てのひら手相<small>PALM READING</small>
        </div>
        <div className="tagline">手のひらに、これからのヒントを。</div>
      </header>

      <div className="dots">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={"dot" + (i <= step ? " on" : "")} />
        ))}
      </div>

      {step === 0 && (
        <section className="card">
          <h2>あなたの利き手は？</h2>
          <p className="sub">
            利き手を「いまのあなた」、反対の手を「生まれ持った本質」として読み解きます。
          </p>
          <OptionList
            opts={HANDEDNESS_OPTS}
            value={handedness}
            onChange={setHandedness}
          />
          <div className="nav">
            <button className="btn primary" onClick={() => setStep(1)}>
              次へ
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="card">
          <h2>どの手を占いますか？</h2>
          <p className="sub">
            片手だけでも占えます。両手だと「生まれ持った自分」と「いまの自分」の違いも読めます。
          </p>
          <OptionList opts={MODE_OPTS} value={mode} onChange={setMode} />

          <p className="sub" style={{ marginTop: 14 }}>
            ※ 手相の読み取り・診断は端末内で行います。画像を外部に送信・保存することはありません。
          </p>

          <div className="nav">
            <button className="btn ghost" onClick={() => setStep(0)}>
              戻る
            </button>
            <button className="btn primary" onClick={startCapture}>
              撮影へ進む
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <CaptureStep
          key={scanIdx}
          hand={scanQueue[scanIdx]}
          stepLabel={stepLabel}
          total={total}
          isFirst={scanIdx === 0}
          onComplete={handleComplete}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && captured.length > 0 && (
        <ResultStep
          handedness={handedness}
          mode={mode}
          captured={captured}
          onRestart={restart}
          onRecapture={startCapture}
        />
      )}
    </div>
  );
}
