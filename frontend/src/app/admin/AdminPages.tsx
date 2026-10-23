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
export { AdminOverviewPage } from "./AdminOverviewPage"
export { AdminProductsPage } from "./AdminProductsPage"
export { ProductFormPage } from "./ProductFormPage"
export { CategoriesPage } from "./CategoriesPage"
export { BrandsAdminPage } from "./BrandsAdminPage"
export { InventoryPage } from "./InventoryPage"
export { AdminOrdersPage } from "./AdminOrdersPage"
export { AdminOrderDetailPage } from "./AdminOrderDetailPage"
export { GenericAdminPage, Customers, Deliveries, Inquiries, Settings } from "./GenericAdminPage"
export { FormCard, AdminField, SimpleTable } from "./AdminSharedComponents"
