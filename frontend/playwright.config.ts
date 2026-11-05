import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:8443"
const useExternalServer = process.env.E2E_EXTERNAL_SERVER === "true"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
  },
  ...(useExternalServer
    ? {}
    : {
        webServer: {
          command: "npm run dev -- --host 127.0.0.1 --port 8443 --strictPort",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
})
