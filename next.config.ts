import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve("./"),
    resolveAlias: {
      fs: { browser: "./app/lib/empty.ts" },
      path: { browser: "./app/lib/empty.ts" },
      module: { browser: "./app/lib/empty.ts" },
    },
  },
  webpack(config, { isServer }) {
    // Enable async WebAssembly and layers compatibility for Next.js App Router
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Rule to handle streaming compilation of .wasm files on the browser target
    if (!isServer) {
      config.module.rules.push({
        test: /\.wasm$/,
        type: "webassembly/async",
      });
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        module: false,
      };
    }

    return config;
  },
};

export default nextConfig;
