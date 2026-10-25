import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  distDir: process.env.E2E_AUTH_EMULATOR === "1" ? ".next-auth-test" : ".next",
  poweredByHeader: false,
  devIndicators: false,
  webpack(config) {
    const ignored = config.watchOptions?.ignored;
    config.watchOptions = {
      ...config.watchOptions,
      // The running agent bridge updates its heartbeat every 500 ms.
      // Those runtime files must not trigger application reloads.
      ignored: ignored instanceof RegExp
        ? new RegExp(`${ignored.source}|${/[\\/](?:\.agent-bridge|test-results|playwright-report)[\\/]/.source}`, ignored.flags)
        : [
            ...(Array.isArray(ignored) ? ignored : ignored ? [ignored] : []),
            "**/.agent-bridge/**",
            "**/test-results/**",
            "**/playwright-report/**",
          ],
    };
    return config;
  },
};

export default function configure(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY must be configured before building.");
  }
  return nextConfig;
}
