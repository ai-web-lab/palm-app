/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 静的サイトとして書き出す（APIなし・完全クライアント動作）。
  // Cloudflare Pages / Netlify / GitHub Pages 等の静的ホスティングに out/ を配信できる。
  output: "export",
  // next/image は未使用（プレーン<img>）だが、静的書き出しでは最適化を無効化しておく。
  images: { unoptimized: true },
};

export default nextConfig;
