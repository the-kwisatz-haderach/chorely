import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@chorely/api-client", "@chorely/domain"],
};

export default config;
