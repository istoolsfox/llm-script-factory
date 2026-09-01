import type { NextConfig } from "next";

// Backend proxy target for same-origin /api requests.
// In production the frontend is the only public entry point; it proxies
// /api/* to the backend bound on localhost only.
const backendUrl = process.env.BACKEND_PROXY_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
