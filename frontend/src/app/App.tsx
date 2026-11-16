import { createBrowserRouter, Link, Navigate, RouterProvider, useRouteError } from "react-router"
import {
    AdminLayout,
    AdminOrderDetailPage,
    AdminPhoneOrderPage,
    AdminOrdersPage,
    AdminOverviewPage,
    AdminProductsPage,
    BrandsAdminPage,
    CategoriesPage,
    DeliveryPartnersPage,
    GenericAdminPage,
    InventoryPage,
    ProductFormPage,
} from "./admin"
import { AuthProvider, useAuth } from "./authContext"
import { Button, EmptyState } from "./components"
import { AppSplashScreen } from "./components/AppSplashScreen"
import { InstallPwaBanner } from "./components/InstallPwaBanner"
import { DeliveryPartnerPortalPage } from "./partner/DeliveryPartnerPortalPage"
import { AdminRoute, CustomerRoute, DeliveryPartnerRoute } from "./RouteGuards"
import { StoreProvider } from "./store"
import {
    AboutPage,
    AccountPage,
    AuthPage, BrandDetailPage,
    BrandsPage, CartPage,
    CheckoutPage, ComparePage, ContactPage, HomePage, LiveTrackingDetailPage, OrderDetailPage,
    OrdersPage,
    OrderSuccessPage, ProductDetailPage, ProductsPage, SharedTrackingPage, StorefrontLayout, TrackingPage, WishlistPage
} from "./user"

function RouteErrorBoundary() {
  const error: any = useRouteError()
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-red-200 bg-red-50/90 p-6 text-center space-y-3">
        <h3 className="text-lg font-bold text-red-900">Something went wrong</h3>
        <p className="text-xs text-red-700 leading-relaxed">
          {error?.message || "An unexpected error occurred while rendering this page."}
        </p>
        <div className="pt-2 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()} variant="primary">
            Reload Page
          </Button>
          <Link to="/">
            <Button variant="outline">Go to Home</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="container-wide py-16">
      <EmptyState
        title="Page not found"
        text="The page you requested does not exist in this prototype."
        action={
          <Link to="/">
            <Button>Back to home</Button>
          </Link>
        }
      />
    </div>
  )
}

function SignedInHome() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="container-wide flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D4AF37] border-t-transparent" />
      </div>
    )
  }

  if (user?.role === "admin" || user?.role === "staff") {
    return <Navigate to="/admin" replace />
  }
  if (user?.role === "delivery_partner") {
    return <Navigate to="/partner/dashboard" replace />
  }

  return <HomePage />
}

const router = createBrowserRouter([
  {
    Component: StorefrontLayout,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, Component: SignedInHome },
      { path: "products", Component: ProductsPage },
      { path: "category/:slug", Component: ProductsPage },
      { path: "product/:id", Component: ProductDetailPage },
      { path: "brands", Component: BrandsPage },
      { path: "brands/:slug", Component: BrandDetailPage },
      { path: "compare", Component: ComparePage },
      { path: "cart", Component: CartPage },
      { path: "checkout", Component: CheckoutPage },
      { path: "order-success/:id", Component: OrderSuccessPage },
      { path: "track-order/:id", Component: TrackingPage },
      { path: "track-order/:id/live", Component: LiveTrackingDetailPage },
      { path: "shared-tracking/:token", Component: SharedTrackingPage },
      { path: "wishlist", Component: WishlistPage },
      { path: "login", Component: AuthPage },
      { path: "signup", Component: AuthPage },
      { path: "reset-password", Component: AuthPage },
      { path: "about", Component: AboutPage },
      { path: "contact", Component: ContactPage },
      { path: "bulk-order", element: <ContactPage bulk /> },
      // Customer Protected Routes
      {
        Component: CustomerRoute,
        children: [
          { path: "account", Component: AccountPage },
          { path: "my-orders", Component: OrdersPage },
          { path: "orders", Component: OrdersPage },
          { path: "my-orders/:id", Component: OrderDetailPage },
        ],
      },
      { path: "*", Component: NotFound },
    ],
  },
  // Admin Protected Routes
  {
    path: "admin",
    Component: AdminRoute,
    children: [
      {
        Component: AdminLayout,
        children: [
          { index: true, Component: AdminOverviewPage },
          { path: "products", Component: AdminProductsPage },
          { path: "products/new", Component: ProductFormPage },
          { path: "products/:id/edit", Component: ProductFormPage },
          { path: "categories", Component: CategoriesPage },
          { path: "brands", Component: BrandsAdminPage },
          { path: "inventory", Component: InventoryPage },
          { path: "orders", Component: AdminOrdersPage },
          { path: "orders/new-phone", Component: AdminPhoneOrderPage },
          { path: "orders/:id", Component: AdminOrderDetailPage },
          { path: "customers", element: <GenericAdminPage kind="customers" /> },
          { path: "deliveries", element: <GenericAdminPage kind="deliveries" /> },
          { path: "delivery-partners", Component: DeliveryPartnersPage },
          { path: "inquiries", element: <GenericAdminPage kind="inquiries" /> },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
  // Delivery Partner Protected Routes
  {
    path: "partner",
    Component: DeliveryPartnerRoute,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "dashboard", Component: DeliveryPartnerPortalPage },
      { index: true, Component: DeliveryPartnerPortalPage },
      { path: "*", Component: NotFound },
    ],
  },
])

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <AppSplashScreen />
        <RouterProvider router={router} />
        <InstallPwaBanner />
      </StoreProvider>
    </AuthProvider>
  )
}
