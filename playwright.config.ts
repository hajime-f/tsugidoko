import { defineConfig, devices } from "@playwright/test";

const authEmulator = process.env.E2E_AUTH_EMULATOR === "1";
const port = authEmulator ? 3101 : 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // The emulator's account picker refreshes when another test creates an account.
  workers: authEmulator ? 1 : 2,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !authEmulator,
    env: authEmulator ? { NEXT_PUBLIC_AUTH_EMULATOR_URL: "http://127.0.0.1:9199" } : {},
  },
});
