import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // gzip in the Next server buffers the proxied LangGraph event stream until it ends,
  // so replies would appear all at once instead of streaming.
  compress: false,
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
