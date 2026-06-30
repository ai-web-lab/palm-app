import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * LLM特徴量抽出。
 * 手のひら画像を Claude Vision に渡し、「線の特徴量」だけを構造化出力で受け取る。
 * 文言・診断は生成させない（トーン制御は palm_rules.json 側で行う）。
 * ※ 線の座標(なぞる/オーバーレイ=B)は廃止したため要求しない。読み取り(A)に専念させる。
 *
 * ⚠️ この経路は画像を外部API(Anthropic)へ送信する。呼び出しはユーザー同意時のみ。
 */

const ENUM = {
  length: ["long", "standard", "short"],
  curve: ["deep", "standard", "shallow"],
  depth: ["dark", "standard", "faint"],
  slope: ["downward", "straight", "upward"],
  start_height: ["high", "standard", "low"],
  presence: ["present", "absent"],
  count: ["single", "multiple"],
  direction: ["upward", "straight", "downward"],
} as const;

const line = (props: Record<string, readonly string[]>) => ({
  type: "object",
  additionalProperties: false,
  required: [...Object.keys(props)],
  properties: Object.fromEntries(
    Object.entries(props).map(([k, v]) => [k, { type: "string", enum: v }]),
  ),
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "life_line",
    "head_line",
    "heart_line",
    "fate_line",
    "sun_line",
    "money_line",
    "marriage_line",
  ],
  properties: {
    life_line: line({ length: ENUM.length, curve: ENUM.curve, depth: ENUM.depth }),
    head_line: line({ slope: ENUM.slope, length: ENUM.length }),
    heart_line: line({
      length: ENUM.length,
      start_height: ENUM.start_height,
      depth: ENUM.depth,
    }),
    fate_line: line({ presence: ENUM.presence, length: ENUM.length, depth: ENUM.depth }),
    sun_line: line({
      presence: ENUM.presence,
      length: ENUM.length,
      depth: ENUM.depth,
      count: ENUM.count,
    }),
    money_line: line({ presence: ENUM.presence, depth: ENUM.depth, count: ENUM.count }),
    marriage_line: line({
      presence: ENUM.presence,
      length: ENUM.length,
      depth: ENUM.depth,
      direction: ENUM.direction,
      count: ENUM.count,
    }),
  },
} as const;

const SYSTEM = [
  "あなたは手のひら画像から手相の線を観察し、各線の『特徴量』を読み取る視覚アシスタント。",
  "診断文・占い文・寿命/病気/人格への言及は一切しない。出力はスキーマ通りのデータのみ。",
  "【手の向きを最初に見極める】まず親指がどちら側にあるか確認する。手のひらをカメラに向けた右手は親指が画像の左側、左手は親指が画像の右側に写る。生命線と知能線は親指側（親指と人差し指の間）から始まる。",
  "各線の場所の目安：生命線=親指の付け根を囲む弧、知能線=手のひら中央を横断、感情線=指の付け根寄りを横断、運命線=手首から中指へ縦。手の輪郭ではなく手のひら内部のしわを見る。",
  "【特徴量】長さ・濃さ・カーブ・傾き・起点の高さなどを、手のひら全体に対する相対で判断する。判別が難しい特徴は必ず standard（無理に断定しない）。",
  "運命線・太陽線・財運線・結婚線は『ない人』も多い。線が見えなければ presence=absent。",
].join("\n");

const HAND_LABEL: Record<string, string> = { right: "右手", left: "左手" };

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "no_api_key" }, { status: 503 });
  }

  let body: { image?: unknown; hand?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const image = body.image;
  if (typeof image !== "string" || !image) {
    return Response.json({ error: "no_image" }, { status: 400 });
  }
  const handLabel = typeof body.hand === "string" ? HAND_LABEL[body.hand] : undefined;

  // dataURL から media_type と base64 を取り出す
  const m = image.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);
  const mediaType = (m ? m[1] : "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "image/gif";
  const data = m ? m[2] : image;

  const client = new Anthropic({ apiKey });

  try {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            {
              type: "text",
              text:
                (handLabel ? `これは${handLabel}（手のひらをカメラに向けた状態）です。` : "") +
                "この手のひら画像から、7本の手相線の特徴量をスキーマ通りに読み取ってください。まず親指の位置から手の向きを見極めてください。",
            },
          ],
        },
      ],
    });

    const textBlock = res.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json({ error: "no_output" }, { status: 502 });
    }
    // モデル出力（線ごとの特徴量）をそのまま診断用 features として返す。
    const features = JSON.parse(textBlock.text) as Record<
      string,
      Record<string, string>
    >;
    return Response.json({ features, model: res.model });
  } catch (e) {
    console.error("[diagnose] error:", e);
    return Response.json(
      { error: "api_error", message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
