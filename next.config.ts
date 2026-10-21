import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
