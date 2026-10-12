import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Set only by the GitHub Pages workflow (e.g. "/budgeting"). When present, the build is a static
// export served under that path; local dev and `next start` are unaffected.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(basePath ? { output: "export" as const, basePath } : {}),
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
