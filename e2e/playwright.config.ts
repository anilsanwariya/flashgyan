import { defineConfig, devices } from "@playwright/test";

// The site runs in dev mode against mock-supabase.mjs (fixed sample data), so tests
// never touch the real database, AI or Telegram.
const MOCK_URL = "http://127.0.0.1:54321";
const SITE_URL = "http://127.0.0.1:8080";
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: ci,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: SITE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Most students use Android phones.
    { name: "android-phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "node mock-supabase.mjs",
      url: `${MOCK_URL}/health`,
      reuseExistingServer: !ci,
    },
    {
      command: "npx vite dev --host 127.0.0.1 --port 8080 --strictPort",
      cwd: "..",
      url: `${SITE_URL}/robots.txt`,
      timeout: 180_000,
      reuseExistingServer: !ci,
      env: {
        SUPABASE_URL: MOCK_URL,
        VITE_SUPABASE_URL: MOCK_URL,
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
      },
    },
  ],
});
