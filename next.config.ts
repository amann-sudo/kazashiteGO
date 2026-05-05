import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pagesの静的配信に載せるため、Next.jsは静的HTMLとして書き出します。
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
