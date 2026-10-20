import { createBrowserRouter, RouterProvider } from "react-router"
import { Button, EmptyState } from "./components"
import { StoreProvider } from "./store"
import { AuthProvider } from "./authContext"
import { CustomerRoute, AdminRoute } from "./RouteGuards"
import { StorefrontLayout } from "./user"
import {
  HomePage,
  ProductsPage,
  ProductDetailPage,
  BrandDetailPage,
  BrandsPage,
  ComparePage,
  CartPage,
  CheckoutPage,
  OrderDetailPage,
  OrdersPage,
  OrderSuccessPage,
  TrackingPage,
  WishlistPage,
  AboutPage,
  AccountPage,
  AuthPage,
  ContactPage,
} from "./user"
import {
  AdminLayout,
  AdminOrderDetailPage,
  AdminOrdersPage,
  AdminOverviewPage,
  AdminProductsPage,
  CategoriesPage,
  BrandsAdminPage,
  GenericAdminPage,
  InventoryPage,
  ProductFormPage,
} from "./admin"
import { Link } from "react-router"

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

const router = createBrowserRouter([
  {
    Component: StorefrontLayout,
    children: [
      { index: true, Component: HomePage },
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
      { path: "wishlist", Component: WishlistPage },
      { path: "login", Component: AuthPage },
      { path: "signup", Component: AuthPage },
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
          { path: "orders/:id", Component: AdminOrderDetailPage },
          { path: "customers", element: <GenericAdminPage kind="customers" /> },
          { path: "audit", element: <GenericAdminPage kind="audit" /> },
          { path: "deliveries", element: <GenericAdminPage kind="deliveries" /> },
          { path: "inquiries", element: <GenericAdminPage kind="inquiries" /> },
          { path: "settings", element: <GenericAdminPage kind="settings" /> },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
])

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <RouterProvider router={router} />
      </StoreProvider>
    </AuthProvider>
  )
}
