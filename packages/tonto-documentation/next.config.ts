import type { NextConfig } from "next"

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["next-mdx-remote"],
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
}

export default nextConfig
