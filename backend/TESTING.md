# Backend verification (no Docker)

## Full production check

Start the backend in one terminal:

```sh
npm run dev
```

Then, from `backend/`, run:

```sh
npm run test:production
```

This runs the TypeScript check, production build, complete Vitest suite, and
live API smoke checks against `http://127.0.0.1:5000/api/v1`. Set
`API_BASE_URL` to check another running backend. Readiness is expected to be
healthy, so the backend must have working Supabase configuration.
The Vitest subprocess runs with Supabase credentials cleared and database
integration tests disabled; the separate live API smoke stage uses the current
shell environment.

The live smoke checks cover public read endpoints, validation responses,
authentication requirements for protected route groups, and (when test
credentials are supplied) read-only customer, admin, and delivery-partner
workflows. They do not create or change orders, products, addresses, inventory,
or delivery status.

```sh
API_BASE_URL=https://staging.example.com/api/v1 npm run test:production
```

To run only the live API checks, with the backend already running:

```sh
npm run test:api
```

Optional role accounts add authenticated read-only checks:

```sh
SMOKE_CUSTOMER_EMAIL=customer-test@example.com SMOKE_CUSTOMER_PASSWORD=... npm run test:api
SMOKE_ADMIN_EMAIL=admin-test@example.com SMOKE_ADMIN_PASSWORD=... npm run test:api
SMOKE_DELIVERY_EMAIL=delivery-test@example.com SMOKE_DELIVERY_PASSWORD=... npm run test:api
```

Use dedicated staging accounts and keep credentials in environment variables,
never source control.

## Database integration test

The catalogue rollback integration test creates and drops a uniquely named
temporary schema. It is skipped by default so normal verification does not
perform database DDL. To opt in, set `RUN_DATABASE_INTEGRATION_TESTS=true` and
provide `DATABASE_URL` for a disposable test database only:

```sh
RUN_DATABASE_INTEGRATION_TESTS=true npm test -- tests/transaction-runner.test.ts
```

Do not point this test at the production database.
