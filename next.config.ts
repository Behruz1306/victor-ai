import type { NextConfig } from "next";

// Content-Security-Policy with a per-request script nonce is set in src/middleware.ts.
// API routes answer JSON only; they still get a locked-down policy here.
const apiCsp = "default-src 'none'; frame-ancestors 'none'";

const nextConfig: NextConfig = {
  // `pnpm dev` compiles into .next-dev, so `pnpm build` / e2e never clobber a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Docker builds a standalone server (NEXT_OUTPUT=standalone); PaaS hosts run `next start`.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  typedRoutes: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: apiCsp }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
