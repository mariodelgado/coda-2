import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  async rewrites() {
    // Same-origin proxy for the control plane in dev.
    // UI at :3000 can call /qpu/* and Next dev server forwards to the FastAPI at :8000.
    // This avoids browser cross-origin / private-network preflight friction in Chromium.
    // When unset, lib/api.ts defaults NEXT_PUBLIC_API_BASE to "/qpu".
    return [
      {
        source: "/qpu/:path*",
        destination: "http://127.0.0.1:8000/:path*",
      },
    ]
  },
}

export default nextConfig
