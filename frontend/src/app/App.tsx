import { createBrowserRouter, RouterProvider } from "react-router"
import { AdminLayout, Button, EmptyState, StorefrontLayout } from "./components"
import { StoreProvider } from "./store"
import { HomePage, ProductDetailPage, ProductsPage } from "./pages/StorePages"
import { BrandDetailPage, BrandsPage, ComparePage } from "./pages/BrandPages"
import {
  CartPage,
  CheckoutPage,
  OrderDetailPage,
  OrdersPage,
  OrderSuccessPage,
  TrackingPage,
  WishlistPage,
} from "./pages/FlowPages"
import {
  AboutPage,
  AccountPage,
  AuthPage,
  ContactPage,
} from "./pages/InfoPages"
import {
  AdminOrderDetailPage,
  AdminOrdersPage,
  AdminOverviewPage,
  AdminProductsPage,
  CategoriesPage,
  BrandsAdminPage,
  GenericAdminPage,
  InventoryPage,
  ProductFormPage,
} from "./pages/AdminPages"
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
      { path: "my-orders", Component: OrdersPage },
      { path: "my-orders/:id", Component: OrderDetailPage },
      { path: "wishlist", Component: WishlistPage },
      { path: "login", Component: AuthPage },
      { path: "signup", Component: AuthPage },
      { path: "account", Component: AccountPage },
      { path: "about", Component: AboutPage },
      { path: "contact", Component: ContactPage },
      { path: "bulk-order", element: <ContactPage bulk /> },
      { path: "*", Component: NotFound },
    ],
  },
  {
    path: "admin",
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
      { path: "deliveries", element: <GenericAdminPage kind="deliveries" /> },
      { path: "inquiries", element: <GenericAdminPage kind="inquiries" /> },
      { path: "settings", element: <GenericAdminPage kind="settings" /> },
      { path: "*", Component: NotFound },
    ],
  },
])

export default function App() {
  return (
    <StoreProvider>
      <RouterProvider router={router} />
    </StoreProvider>
  )
}
