import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * LLM特徴量抽出（プロトタイプ）。
 * 手のひら画像を Claude Vision に渡し、「線の特徴量」だけを構造化出力で受け取る。
 * 文言・診断は生成させない（トーン制御は palm_rules.json 側で行う）。
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

// 線に沿った正規化座標（0..1, 画像左上=0,0）の点列。線が無ければ空配列。
const POINTS = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["x", "y"],
    properties: { x: { type: "number" }, y: { type: "number" } },
  },
};

const line = (props: Record<string, readonly string[]>) => ({
  type: "object",
  additionalProperties: false,
  required: [...Object.keys(props), "points"],
  properties: {
    ...Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, { type: "string", enum: v }]),
    ),
    points: POINTS,
  },
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
  "あなたは手のひら画像から手相の線を観察し、各線の『特徴量』と『画像上の位置』を抽出する視覚アシスタント。",
  "診断文・占い文・寿命/病気/人格への言及は一切しない。出力はスキーマ通りのデータのみ。",
  "【特徴量】判別が難しい特徴は必ず standard（無理に断定しない）。",
  "運命線・太陽線・財運線・結婚線は『ない人』も多い。線が見えなければ presence=absent。",
  "長さ・濃さ・カーブは手のひら全体に対する相対で判断する。",
  "【位置(points)】各線について、実際に画像で見える線に沿って始点→終点の順に4〜6個の点を返す。",
  "座標は画像の左上を(x=0,y=0)、右下を(x=1,y=1)とする正規化値（必ず0〜1の範囲）。",
  "生命線=親指の付け根を回る弧、知能線/感情線=横方向、運命線=中央の縦方向、を目安に実線をなぞる。",
  "線が見えない/absent の場合、その線の points は空配列にする。推測で描かない。",
].join("\n");

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "no_api_key" }, { status: 503 });
  }

  let body: { image?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const image = body.image;
  if (typeof image !== "string" || !image) {
    return Response.json({ error: "no_image" }, { status: 400 });
  }

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
              text: "この手のひら画像から、7本の手相線の特徴量と位置(points)をスキーマ通りに抽出してください。",
            },
          ],
        },
      ],
    });

    const textBlock = res.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json({ error: "no_output" }, { status: 502 });
    }
    // モデル出力（線ごとに features + points）を、診断用 features と座標 lines に分離。
    const raw = JSON.parse(textBlock.text) as Record<
      string,
      Record<string, unknown> & { points?: { x: number; y: number }[] }
    >;
    const features: Record<string, Record<string, string>> = {};
    const lines: Record<string, { x: number; y: number }[]> = {};
    for (const [key, val] of Object.entries(raw)) {
      const { points, ...feats } = val;
      features[key] = feats as Record<string, string>;
      lines[key] = Array.isArray(points) ? points : [];
    }
    return Response.json({ features, lines, model: res.model });
  } catch (e) {
    console.error("[diagnose] error:", e);
    return Response.json(
      { error: "api_error", message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
