# Frontend browser checks

These Playwright checks run directly against the Vite app; Docker is not used.

## Run

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

The test runner starts Vite on `http://127.0.0.1:8443` and checks storefront
routes, protected-route redirects, and uncaught browser errors. A working
backend is needed for API-backed content to load, but the route smoke checks
do not create or modify customer, order, or catalog data.

To test an already-running site, set `E2E_EXTERNAL_SERVER=true` and
`E2E_BASE_URL` before running the command.

## Optional signed-in role/reopen checks

Set credentials for dedicated test accounts to include a login-and-reload
check for each role. These tests use the login page and only read the account
after login; they do not log the account out or modify its data.

```sh
E2E_CUSTOMER_EMAIL=customer-test@example.com E2E_CUSTOMER_PASSWORD=... npm run test:e2e
E2E_ADMIN_EMAIL=admin-test@example.com E2E_ADMIN_PASSWORD=... npm run test:e2e
E2E_DELIVERY_EMAIL=delivery-test@example.com E2E_DELIVERY_PASSWORD=... npm run test:e2e
```

Unset role credentials are skipped. Do not put credentials in source files or
commit them. Prefer dedicated test accounts and a staging backend.

The HTML report is written to `playwright-report/`; failed-run traces are
written under `test-results/`.
