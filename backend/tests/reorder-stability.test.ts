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

describe('Hindustan Hardware Reorder Stability & Idempotency Tests', () => {
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
  const baseFingerprintMap = new Map(baseMapped.map((p) => [p.persistentIdentityKey, p.sourceFingerprint]));

  it('should maintain 100% identical SKUs, slugs, and fingerprints when randomly shuffled', () => {
    // Fisher-Yates random shuffle
    const shuffled = [...originalProducts];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const { validatedProducts: shuffledMapped } = mapAndValidateProducts(
      shuffled,
      brandRegistry,
      categoryRegistry,
      comparisonGroups
    );

    expect(shuffledMapped.length).toBe(1944);
    for (const p of shuffledMapped) {
      expect(p.sku).toBe(baseSkuMap.get(p.persistentIdentityKey));
      expect(p.slug).toBe(baseSlugMap.get(p.persistentIdentityKey));
      expect(p.sourceFingerprint).toBe(baseFingerprintMap.get(p.persistentIdentityKey));
    }
  });

  it('should maintain 100% identical SKUs, slugs, and fingerprints when sorted alphabetically by product name', () => {
    const sortedByName = [...originalProducts].sort((a, b) => a.productName.localeCompare(b.productName));

    const { validatedProducts: sortedMapped } = mapAndValidateProducts(
      sortedByName,
      brandRegistry,
      categoryRegistry,
      comparisonGroups
    );

    expect(sortedMapped.length).toBe(1944);
    for (const p of sortedMapped) {
      expect(p.sku).toBe(baseSkuMap.get(p.persistentIdentityKey));
      expect(p.slug).toBe(baseSlugMap.get(p.persistentIdentityKey));
      expect(p.sourceFingerprint).toBe(baseFingerprintMap.get(p.persistentIdentityKey));
    }
  });

  it('should maintain 100% identical SKUs, slugs, and fingerprints when sorted by category', () => {
    const sortedByCat = [...originalProducts].sort((a, b) => a.categoryName.localeCompare(b.categoryName));

    const { validatedProducts: catMapped } = mapAndValidateProducts(
      sortedByCat,
      brandRegistry,
      categoryRegistry,
      comparisonGroups
    );

    expect(catMapped.length).toBe(1944);
    for (const p of catMapped) {
      expect(p.sku).toBe(baseSkuMap.get(p.persistentIdentityKey));
      expect(p.slug).toBe(baseSlugMap.get(p.persistentIdentityKey));
      expect(p.sourceFingerprint).toBe(baseFingerprintMap.get(p.persistentIdentityKey));
    }
  });

  it('specifically tests Prince 6" Coupler and Radison Spindle Dish collision pairs under inverted order', () => {
    // Reverse only the collision items
    const collisionItems = originalProducts.filter(
      (p) =>
        (p.productName.includes('Coupler Pvc') && p.brandName === 'Prince') ||
        (p.productName.includes('Spindle Dish') && p.brandName === 'Radison')
    );

    const reversedCollisionItems = [...collisionItems].reverse();

    const { validatedProducts: mapped } = mapAndValidateProducts(
      reversedCollisionItems,
      brandRegistry,
      categoryRegistry,
      comparisonGroups
    );

    for (const p of mapped) {
      expect(p.sku).toBe(baseSkuMap.get(p.persistentIdentityKey));
      expect(p.slug).toBe(baseSlugMap.get(p.persistentIdentityKey));
      expect(p.sourceFingerprint).toBe(baseFingerprintMap.get(p.persistentIdentityKey));
    }
  });
});
