import type { NextConfig } from "next";

// Internal LangGraph server; the browser only ever talks to /api on this app.
const langgraphUrl = process.env.LANGGRAPH_INTERNAL_URL;

const nextConfig: NextConfig = {
  output: "standalone",
  // gzip in the Next server buffers the proxied LangGraph event stream until it ends,
  // so replies would appear all at once instead of streaming.
  compress: false,
  async rewrites() {
    return langgraphUrl
      ? [{ source: "/api/:path*", destination: `${langgraphUrl}/:path*` }]
      : [];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
