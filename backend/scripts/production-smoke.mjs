const apiBase = new URL(process.env.API_BASE_URL || "http://127.0.0.1:5000/api/v1")
apiBase.pathname = `${apiBase.pathname.replace(/\/+$/, "")}/`

let passed = 0
let failed = 0

function endpoint(path) {
  return new URL(path.replace(/^\/+/, ""), apiBase)
}

async function request(path, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers["Content-Type"] = "application/json"

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    return await fetch(endpoint(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function check(name, path, expected, options) {
  try {
    const response = await request(path, options)
    if (expected.includes(response.status)) {
      passed += 1
      console.log(`PASS ${name} (${response.status})`)
      return response
    }

    failed += 1
    console.error(`FAIL ${name}: expected ${expected.join(" or ")}, received ${response.status}`)
    return response
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}: ${error.message}`)
    return null
  }
}

async function checkSuccessEnvelope(name, path, token) {
  const response = await check(name, path, [200], { token })
  if (!response) return null
  try {
    const body = await response.json()
    if (body?.success !== true) {
      failed += 1
      passed -= 1
      console.error(`FAIL ${name}: HTTP 200 response did not contain success: true`)
      return null
    }
    return body.data
  } catch {
    failed += 1
    passed -= 1
    console.error(`FAIL ${name}: response was not a valid JSON success envelope`)
    return null
  }
}

const publicReadChecks = [
  ["versioned API health", "health"],
  ["service readiness (Supabase reachable)", "health/ready"],
  ["public categories", "categories"],
  ["public brands", "brands"],
  ["public product catalogue", "products"],
  ["featured products", "products/featured"],
  ["product listing query validation", "products?limit=invalid"],
  ["product comparison route", "products/compare?ids="],
  ["product image gallery route", "products/00000000-0000-4000-8000-000000000001/images"],
  ["product alternatives route", "products/00000000-0000-4000-8000-000000000001/alternatives"],
  ["related products route", "products/00000000-0000-4000-8000-000000000001/related"],
  ["supported delivery cities", "location/cities"],
  ["delivery serviceability", "location/serviceability?city=Jehanabad"],
]

for (const [name, path] of publicReadChecks) {
  if (name === "product listing query validation") {
    await check(name, path, [400])
    continue
  }
  if (name === "product comparison route") {
    await check(name, path, [400])
    continue
  }
  await checkSuccessEnvelope(name, path, undefined)
}

const notFoundChecks = [
  ["category lookup by slug", "categories/slug/production-smoke-no-such-category"],
  ["category lookup by ID", "categories/00000000-0000-4000-8000-000000000001"],
  ["brand lookup by slug", "brands/slug/production-smoke-no-such-brand"],
  ["brand lookup by ID", "brands/00000000-0000-4000-8000-000000000001"],
  ["product lookup by slug", "products/slug/production-smoke-no-such-product"],
  ["product lookup by ID", "products/00000000-0000-4000-8000-000000000001"],
]
for (const [name, path] of notFoundChecks) {
  await check(name, path, [404])
}

await check("location search query validation", "location/search", [400])
await check("reverse geocoding query validation", "location/reverse", [400])

const rootHealthUrl = new URL("/health-check", apiBase.origin)
await check("process health check", rootHealthUrl.href, [200])

const validationChecks = [
  ["login payload validation", "auth/login", "POST"],
  ["registration payload validation", "auth/register", "POST"],
  ["token refresh payload validation", "auth/refresh", "POST"],
  ["forgot-password payload validation", "auth/forgot-password", "POST"],
  ["bulk inquiry payload validation", "bulk-inquiries", "POST"],
]

for (const [name, path, method] of validationChecks) {
  await check(name, path, [400], { method, body: {} })
}

await check("guest cart read rejects missing token", "cart/guest", [401])
await check("guest cart item add rejects missing token", "cart/guest/items", [401], { method: "POST", body: {} })
await check("guest cart item update rejects missing token", "cart/guest/items/smoke-test-item", [401], { method: "PATCH", body: {} })
await check("guest cart item delete rejects missing token", "cart/guest/items/smoke-test-item", [401], { method: "DELETE" })
await check("guest cart clear rejects missing token", "cart/guest/items", [401], { method: "DELETE" })
await check("unknown API route returns 404", "smoke-test-route-that-does-not-exist", [404])

const protectedRoutes = [
  ["GET", "auth/me"],
  ["GET", "auth/session"],
  ["POST", "auth/logout"],
  ["POST", "auth/reset-password"],
  ["GET", "customers/me"],
  ["PATCH", "customers/me"],
  ["GET", "customers/me/addresses"],
  ["POST", "customers/me/addresses"],
  ["GET", "customers/me/addresses/00000000-0000-4000-8000-000000000001"],
  ["PATCH", "customers/me/addresses/00000000-0000-4000-8000-000000000001"],
  ["DELETE", "customers/me/addresses/00000000-0000-4000-8000-000000000001"],
  ["POST", "customers/me/addresses/00000000-0000-4000-8000-000000000001/default"],
  ["GET", "customers/me/wishlist"],
  ["POST", "customers/me/wishlist"],
  ["DELETE", "customers/me/wishlist/smoke-test-product"],
  ["GET", "customers/me/orders"],
  ["GET", "customers/me/orders/00000000-0000-4000-8000-000000000001"],
  ["GET", "customers/me/orders/00000000-0000-4000-8000-000000000001/status"],
  ["GET", "customers/me/orders/00000000-0000-4000-8000-000000000001/tracking"],
  ["POST", "customers/me/orders/00000000-0000-4000-8000-000000000001/cancel"],
  ["GET", "cart"],
  ["POST", "cart/items"],
  ["PATCH", "cart/items/smoke-test-item"],
  ["DELETE", "cart/items/smoke-test-item"],
  ["DELETE", "cart/items"],
  ["POST", "cart/merge"],
  ["POST", "checkout/validate"],
  ["POST", "checkout"],
  ["GET", "deliveries/assigned"],
  ["PATCH", "deliveries/00000000-0000-4000-8000-000000000001/status"],
  ["POST", "deliveries/00000000-0000-4000-8000-000000000001/verify-otp"],
  ["POST", "deliveries/00000000-0000-4000-8000-000000000001/location"],
  ["GET", "deliveries/00000000-0000-4000-8000-000000000001/location"],
  ["GET", "deliveries/00000000-0000-4000-8000-000000000001/locations"],
  ["GET", "deliveries/00000000-0000-4000-8000-000000000001/route"],
  ["GET", "admin/verify"],
  ["GET", "admin/categories"],
  ["POST", "admin/categories"],
  ["PATCH", "admin/categories/00000000-0000-4000-8000-000000000001"],
  ["DELETE", "admin/categories/00000000-0000-4000-8000-000000000001"],
  ["POST", "admin/categories/00000000-0000-4000-8000-000000000001/image"],
  ["GET", "admin/brands"],
  ["POST", "admin/brands"],
  ["PATCH", "admin/brands/00000000-0000-4000-8000-000000000001"],
  ["DELETE", "admin/brands/00000000-0000-4000-8000-000000000001"],
  ["POST", "admin/brands/00000000-0000-4000-8000-000000000001/logo"],
  ["GET", "admin/products/00000000-0000-4000-8000-000000000001"],
  ["POST", "admin/products"],
  ["PATCH", "admin/products/00000000-0000-4000-8000-000000000001"],
  ["DELETE", "admin/products/00000000-0000-4000-8000-000000000001"],
  ["POST", "admin/products/00000000-0000-4000-8000-000000000001/variants"],
  ["PATCH", "admin/products/00000000-0000-4000-8000-000000000001/inventory"],
  ["POST", "admin/products/00000000-0000-4000-8000-000000000001/images"],
  ["PATCH", "admin/products/00000000-0000-4000-8000-000000000001/images/00000000-0000-4000-8000-000000000001"],
  ["POST", "admin/products/00000000-0000-4000-8000-000000000001/images/00000000-0000-4000-8000-000000000001/primary"],
  ["DELETE", "admin/products/00000000-0000-4000-8000-000000000001/images/00000000-0000-4000-8000-000000000001"],
  ["GET", "admin/dashboard"],
  ["GET", "admin/bulk-inquiries"],
  ["PATCH", "admin/bulk-inquiries/00000000-0000-4000-8000-000000000001/read"],
  ["DELETE", "admin/bulk-inquiries/00000000-0000-4000-8000-000000000001"],
  ["GET", "admin/orders"],
  ["GET", "admin/orders/00000000-0000-4000-8000-000000000001"],
  ["PATCH", "admin/orders/00000000-0000-4000-8000-000000000001/status"],
  ["POST", "admin/orders/00000000-0000-4000-8000-000000000001/cancel"],
  ["POST", "admin/orders/00000000-0000-4000-8000-000000000001/collect-cod"],
  ["POST", "admin/orders/00000000-0000-4000-8000-000000000001/invoice"],
  ["POST", "admin/inventory/adjustments"],
  ["GET", "admin/inventory/movements"],
  ["GET", "admin/customers"],
  ["GET", "admin/audit-logs"],
  ["POST", "admin/deliveries/assign"],
  ["PATCH", "admin/deliveries/00000000-0000-4000-8000-000000000001/status"],
  ["GET", "admin/delivery-partners"],
  ["POST", "admin/delivery-partners"],
  ["PATCH", "admin/delivery-partners/00000000-0000-4000-8000-000000000001"],
  ["DELETE", "admin/delivery-partners/00000000-0000-4000-8000-000000000001"],
]

for (const [method, path] of protectedRoutes) {
  await check(`auth required: ${method} /${path}`, path, [401], { method })
}

async function loginAndCheckRole(name, expectedRole) {
  const email = process.env[`SMOKE_${name.toUpperCase()}_EMAIL`]
  const password = process.env[`SMOKE_${name.toUpperCase()}_PASSWORD`]
  if (!email && !password) return null
  if (!email || !password) {
    failed += 1
    console.error(`FAIL ${name} login: set both SMOKE_${name.toUpperCase()}_EMAIL and PASSWORD`)
    return null
  }

  try {
    const response = await request("auth/login", {
      method: "POST",
      body: { email, password },
    })
    const body = await response.json()
    const user = body?.data?.user
    const token = body?.data?.session?.accessToken
    if (response.status !== 200 || !token || user?.role !== expectedRole) {
      failed += 1
      console.error(`FAIL ${name} login: expected a valid ${expectedRole} account`)
      return null
    }
    passed += 1
    console.log(`PASS ${name} test account login and role`)
    return token
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name} login: ${error.message}`)
    return null
  }
}

const customerToken = await loginAndCheckRole("customer", "customer")
if (customerToken) {
  for (const path of ["customers/me", "customers/me/addresses", "customers/me/wishlist", "customers/me/orders"]) {
    await checkSuccessEnvelope(`customer workflow: GET /${path}`, path, customerToken)
  }
}

const adminToken = await loginAndCheckRole("admin", "admin")
if (adminToken) {
  for (const path of [
    "admin/verify",
    "admin/dashboard",
    "admin/categories",
    "admin/brands",
    "admin/orders?limit=1",
    "admin/customers?limit=1",
    "admin/delivery-partners",
    "admin/inventory/movements?limit=1",
    "admin/audit-logs?limit=1",
    "admin/bulk-inquiries",
  ]) {
    await checkSuccessEnvelope(`admin workflow: GET /${path}`, path, adminToken)
  }
}

const deliveryToken = await loginAndCheckRole("delivery", "delivery_partner")
if (deliveryToken) {
  await checkSuccessEnvelope("delivery partner workflow: GET /deliveries/assigned", "deliveries/assigned", deliveryToken)
}

console.log(`\nAPI smoke results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
