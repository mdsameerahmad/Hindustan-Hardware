import { spawnSync } from "node:child_process"

const npm = process.platform === "win32" ? "npm.cmd" : "npm"
const checks = [
  ["Backend TypeScript typecheck", ["run", "typecheck"]],
  ["Backend production build", ["run", "build"]],
  ["Backend full test suite", ["test"]],
  ["Live API endpoint smoke tests", ["run", "test:api"]],
]

let failures = 0

for (const [name, args] of checks) {
  console.log(`\n=== ${name} ===`)
  const env = { ...process.env }
  if (name === "Backend full test suite") {
    env.NODE_ENV = "test"
    env.SUPABASE_URL = ""
    env.SUPABASE_ANON_KEY = ""
    env.SUPABASE_SERVICE_ROLE_KEY = ""
    env.RUN_DATABASE_INTEGRATION_TESTS = ""
  }

  const result = spawnSync(npm, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  })

  if (result.error) {
    console.error(`${name} could not start: ${result.error.message}`)
    failures += 1
  } else if (result.status !== 0) {
    console.error(`${name} failed with exit code ${result.status ?? "unknown"}.`)
    failures += 1
  }
}

if (failures > 0) {
  console.error(`\nBackend production checks completed with ${failures} failed stage(s).`)
  process.exitCode = 1
} else {
  console.log("\nBackend production checks passed.")
}
