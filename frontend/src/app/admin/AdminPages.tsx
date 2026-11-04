/**
 * AdminPages.tsx — Backward compatibility barrel export.
 * All administrative pages have been decomposed into dedicated modular files:
 * - AdminOverviewPage.tsx
 * - AdminProductsPage.tsx
 * - ProductFormPage.tsx
 * - AdminOrdersPage.tsx
 * - AdminOrderDetailPage.tsx
 * - InventoryPage.tsx
 * - CategoriesPage.tsx
 * - BrandsAdminPage.tsx
 * - GenericAdminPage.tsx
 * - AdminSharedComponents.tsx
 */
export { AdminOrderDetailPage } from "./AdminOrderDetailPage"
export { AdminOrdersPage } from "./AdminOrdersPage"
export { AdminOverviewPage } from "./AdminOverviewPage"
export { AdminProductsPage } from "./AdminProductsPage"
export { AdminField, FormCard, SimpleTable } from "./AdminSharedComponents"
export { BrandsAdminPage } from "./BrandsAdminPage"
export { CategoriesPage } from "./CategoriesPage"
export { Customers, Deliveries, GenericAdminPage, Inquiries } from "./GenericAdminPage"
export { InventoryPage } from "./InventoryPage"
export { ProductFormPage } from "./ProductFormPage"

