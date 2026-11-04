import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const config: NextConfig = {
  transpilePackages: ["@chorely/api-client", "@chorely/domain"],
  // Self-contained server for the Docker image (Dockerfile). Tracing from the repo root picks up
  // the workspace packages.
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
};

export default config;
