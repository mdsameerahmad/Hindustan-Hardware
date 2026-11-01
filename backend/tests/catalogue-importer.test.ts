import { describe, it, expect } from 'vitest';
import {
  resolveCataloguePaths,
  loadCsvProducts,
  loadExcelProducts,
  reconcileSourceFiles,
} from '../scripts/catalogue/catalogue-validation';
import {
  buildBrandRegistry,
  buildCategoryRegistry,
  mapAndValidateProducts,
} from '../scripts/catalogue/catalogue-mapping';

describe('Hindustan Hardware Catalogue System Tests', () => {
  const { csvPath, excelPath } = resolveCataloguePaths();
  const csvProducts = loadCsvProducts(csvPath);
  const { products: excelProducts, comparisonGroups } = loadExcelProducts(excelPath);

  it('should load exact 1,944 rows from both CSV and Excel', () => {
    expect(csvProducts.length).toBe(1944);
    expect(excelProducts.length).toBe(1944);
  });

  it('should reconcile names, brands, categories and prices with 0 critical errors', () => {
    const discrepancies = reconcileSourceFiles(csvProducts, excelProducts);
    const criticalErrors = discrepancies.filter((d) => d.severity === 'error');
    expect(criticalErrors.length).toBe(0);
  });

  it('should detect 99 decimal stock items where Excel retains fractional quantities', () => {
    const discrepancies = reconcileSourceFiles(csvProducts, excelProducts);
    const stockWarnings = discrepancies.filter((d) => d.field === 'stockQty');
    expect(stockWarnings.length).toBe(99);
  });

  it('should build 84 unique normalized brands and 51 categories', () => {
    const brandRegistry = buildBrandRegistry(excelProducts);
    const categoryRegistry = buildCategoryRegistry(excelProducts);
    expect(brandRegistry.size).toBe(84);
    expect(categoryRegistry.size).toBe(51);
  });

  it('should ensure zero collisions across brand prefix codes', () => {
    const brandRegistry = buildBrandRegistry(excelProducts);
    const codes = Array.from(brandRegistry.values()).map((b) => b.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('should map 1,944 products with 0 slug and 0 SKU collisions', () => {
    const brandRegistry = buildBrandRegistry(excelProducts);
    const categoryRegistry = buildCategoryRegistry(excelProducts);
    const { validatedProducts, slugCollisions, skuCollisions } = mapAndValidateProducts(
      excelProducts,
      brandRegistry,
      categoryRegistry,
      comparisonGroups
    );

    expect(validatedProducts.length).toBe(1944);
    expect(slugCollisions.length).toBe(0);
    expect(skuCollisions.length).toBe(0);
  });

  it('should preserve original stock and convert negative quantities to 0 in inventory', () => {
    const brandRegistry = buildBrandRegistry(excelProducts);
    const categoryRegistry = buildCategoryRegistry(excelProducts);
    const { validatedProducts } = mapAndValidateProducts(
      excelProducts,
      brandRegistry,
      categoryRegistry,
      comparisonGroups
    );

    const negativeProducts = validatedProducts.filter((p) => p.isNegativeStock);
    expect(negativeProducts.length).toBe(31);

    for (const p of negativeProducts) {
      expect(p.inventoryStockQty).toBe(0);
      expect(p.sourceStockRaw).toBeLessThan(0);
      expect(p.specs.negative_stock_converted).toBe(true);
      expect(p.specs.original_negative_stock).toBe(p.sourceStockRaw);
    }
  });

  it('should floor fractional stock in inventory and preserve exact decimal in specs', () => {
    const brandRegistry = buildBrandRegistry(excelProducts);
    const categoryRegistry = buildCategoryRegistry(excelProducts);
    const { validatedProducts } = mapAndValidateProducts(
      excelProducts,
      brandRegistry,
      categoryRegistry,
      comparisonGroups
    );

    const fractionalProducts = validatedProducts.filter((p) => p.isFractionalStock);
    expect(fractionalProducts.length).toBe(99);

    for (const p of fractionalProducts) {
      expect(p.inventoryStockQty).toBe(Math.max(0, Math.floor(p.sourceStockRaw)));
      expect(p.specs.original_fractional_stock).toBe(p.sourceStockRaw);
    }
  });

  it('should correctly account for unbranded products (brand_id = null)', () => {
    const brandRegistry = buildBrandRegistry(excelProducts);
    const categoryRegistry = buildCategoryRegistry(excelProducts);
    const { validatedProducts } = mapAndValidateProducts(
      excelProducts,
      brandRegistry,
      categoryRegistry,
      comparisonGroups
    );

    const unbranded = validatedProducts.filter((p) => p.brandName === null);
    expect(unbranded.length).toBe(94);
    for (const u of unbranded) {
      expect(u.brandCode).toBe('GEN');
      expect(u.slug).toContain(u.categorySlug);
    }
  });
});
