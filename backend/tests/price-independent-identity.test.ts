import { describe, it, expect } from 'vitest';
import {
  resolveCataloguePaths,
  loadExcelProducts,
} from '../scripts/catalogue/catalogue-validation';
import {
  buildBrandRegistry,
  buildCategoryRegistry,
  mapAndValidateProducts,
} from '../scripts/catalogue/catalogue-mapping';
import { RawSourceProduct } from '../scripts/catalogue/catalogue-types';

describe('Price-Independent Identity & Disambiguation Tests', () => {
  const { excelPath } = resolveCataloguePaths();
  const { products: originalProducts, comparisonGroups } = loadExcelProducts(excelPath);
  const brandRegistry = buildBrandRegistry(originalProducts);
  const categoryRegistry = buildCategoryRegistry(originalProducts);

  const { validatedProducts: baseMapped } = mapAndValidateProducts(
    originalProducts,
    brandRegistry,
    categoryRegistry,
    comparisonGroups
  );

  const baseSkuMap = new Map(baseMapped.map((p) => [p.persistentIdentityKey, p.sku]));
  const baseSlugMap = new Map(baseMapped.map((p) => [p.persistentIdentityKey, p.slug]));

  it('resolves Prince 6" Coupler when MRP changes from 325 to 350 and 275 to 290 without changing SKU or Slug', () => {
    // Find the two Prince 6" Coupler products
    const princeProducts = originalProducts.filter(
      (p) => p.brandName === 'Prince' && p.productName === '6" Coupler Pvc'
    );
    expect(princeProducts.length).toBe(2);

    // Simulate price increase in a future catalogue
    const updatedPrinceProducts: RawSourceProduct[] = princeProducts.map((p) => ({
      ...p,
      mrp: p.mrp === 325 ? 350 : 290,
      sellingPrice: p.sellingPrice === 325 ? 350 : 290,
    }));

    const { validatedProducts: updatedMapped } = mapAndValidateProducts(
      updatedPrinceProducts,
      brandRegistry,
      categoryRegistry,
      comparisonGroups
    );

    expect(updatedMapped.length).toBe(2);
    // Assert both products retained their exact permanent identities, SKUs and Slugs
    for (const p of updatedMapped) {
      expect(p.sku).toBe(baseSkuMap.get(p.persistentIdentityKey));
      expect(p.slug).toBe(baseSlugMap.get(p.persistentIdentityKey));
    }
  });

  it('resolves Radison Spindle Dish when MRP changes from 100 to 120 and 80 to 95 without changing SKU or Slug', () => {
    const radisonProducts = originalProducts.filter(
      (p) => p.brandName === 'Radison' && p.productName === 'Spindle Dish'
    );
    expect(radisonProducts.length).toBe(2);

    const updatedRadisonProducts: RawSourceProduct[] = radisonProducts.map((p) => ({
      ...p,
      mrp: p.mrp === 100 ? 120 : 95,
      sellingPrice: p.sellingPrice === 100 ? 120 : 95,
    }));

    const { validatedProducts: updatedMapped } = mapAndValidateProducts(
      updatedRadisonProducts,
      brandRegistry,
      categoryRegistry,
      comparisonGroups
    );

    expect(updatedMapped.length).toBe(2);
    for (const p of updatedMapped) {
      expect(p.sku).toBe(baseSkuMap.get(p.persistentIdentityKey));
      expect(p.slug).toBe(baseSlugMap.get(p.persistentIdentityKey));
    }
  });

  it('re-import with price changes across random 100 products preserves all SKUs and Slugs', () => {
    const sampleProducts = originalProducts.slice(0, 100).map((p) => ({
      ...p,
      mrp: p.mrp * 1.15, // 15% price increase
      sellingPrice: p.sellingPrice * 1.15,
    }));

    const { validatedProducts: updatedMapped } = mapAndValidateProducts(
      sampleProducts,
      brandRegistry,
      categoryRegistry,
      comparisonGroups
    );

    for (const p of updatedMapped) {
      expect(p.sku).toBe(baseSkuMap.get(p.persistentIdentityKey));
      expect(p.slug).toBe(baseSlugMap.get(p.persistentIdentityKey));
    }
  });
});
