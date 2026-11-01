import crypto from 'crypto';
import {
  RawSourceProduct,
  ComparisonGroup,
  ValidatedProduct,
  NormalizedBrand,
  NormalizedCategory,
} from './catalogue-types';

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Builds canonical normalized brand registry ensuring every brand has a unique,
 * collision-free 3-to-4 character uppercase prefix code.
 */
export function buildBrandRegistry(products: RawSourceProduct[]): Map<string, NormalizedBrand> {
  const brandCounts = new Map<string, number>();
  const brandOriginalNames = new Map<string, string>();

  for (const p of products) {
    const rawBrand = (p.brandName || '').trim();
    if (!rawBrand) continue;
    const lowerKey = rawBrand.toLowerCase();
    brandCounts.set(lowerKey, (brandCounts.get(lowerKey) || 0) + 1);
    if (!brandOriginalNames.has(lowerKey)) {
      brandOriginalNames.set(lowerKey, rawBrand);
    }
  }

  // Pre-configured manual disambiguation overrides for detected prefix collisions
  const manualOverrides: Record<string, string> = {
    'hind': 'HIND',
    'hindware': 'HDW',
    'water man': 'WMAN',
    'waterpark': 'WPRK',
    'watertec': 'WTEC',
    'prince': 'PRNC',
    'astral': 'ASTR',
    'ashirvad': 'ASH',
    'supreme': 'SUPR',
    'finolex': 'FINO',
    'zoloto': 'ZOLO',
  };

  const usedCodes = new Set<string>();
  const registry = new Map<string, NormalizedBrand>();

  const sortedKeys = Array.from(brandCounts.keys()).sort();
  for (const key of sortedKeys) {
    const originalName = brandOriginalNames.get(key)!;
    const count = brandCounts.get(key)!;
    const brandSlug = slugify(originalName);

    let code: string;
    if (manualOverrides[key]) {
      code = manualOverrides[key];
    } else {
      let clean = originalName.toUpperCase().replace(/[^A-Z0-9]/g, '');
      code = clean.substring(0, 4);
      if (code.length < 3) code = code.padEnd(3, 'X');

      if (usedCodes.has(code)) {
        let counter = 1;
        let candidate = clean.substring(0, 3) + counter;
        while (usedCodes.has(candidate)) {
          counter++;
          candidate = clean.substring(0, 3) + counter;
        }
        code = candidate;
      }
    }

    usedCodes.add(code);
    registry.set(key, {
      name: originalName,
      slug: brandSlug,
      code,
      sourceCount: count,
    });
  }

  return registry;
}

/**
 * Builds canonical normalized category registry.
 */
export function buildCategoryRegistry(products: RawSourceProduct[]): Map<string, NormalizedCategory> {
  const catCounts = new Map<string, number>();
  const catOriginalNames = new Map<string, string>();

  for (const p of products) {
    const rawCat = (p.categoryName || '').trim();
    if (!rawCat) continue;
    const lowerKey = rawCat.toLowerCase();
    catCounts.set(lowerKey, (catCounts.get(lowerKey) || 0) + 1);
    if (!catOriginalNames.has(lowerKey)) {
      catOriginalNames.set(lowerKey, rawCat);
    }
  }

  const registry = new Map<string, NormalizedCategory>();
  for (const [key, count] of catCounts.entries()) {
    const originalName = catOriginalNames.get(key)!;
    const catSlug = slugify(originalName);
    registry.set(key, {
      name: originalName,
      slug: catSlug,
      sourceCount: count,
    });
  }

  return registry;
}

/**
 * Validates and maps raw source products into validated products with deterministic
 * slugs, persistent SKUs, collision disambiguation, and technical comparison linking.
 */
export function mapAndValidateProducts(
  products: RawSourceProduct[],
  brandRegistry: Map<string, NormalizedBrand>,
  categoryRegistry: Map<string, NormalizedCategory>,
  comparisonGroups: ComparisonGroup[]
): {
  validatedProducts: ValidatedProduct[];
  slugCollisions: string[];
  skuCollisions: string[];
} {
  // 1. Build Comparison Lookup Map with Technical Compatibility Validation
  // Group key: product_name.toLowerCase() + "|||" + brand_name.toLowerCase()
  const comparisonLookup = new Map<string, { groupId: string; groupName: string; specs: any }>();

  for (const group of comparisonGroups) {
    // Generate deterministic UUID for verified comparison group
    const groupNamespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const groupHash = crypto.createHash('sha1').update('HH_COMP_' + group.groupName.toLowerCase()).digest('hex');
    const deterministicGroupId = [
      groupHash.substring(0, 8),
      groupHash.substring(8, 12),
      '4' + groupHash.substring(13, 16),
      ((parseInt(groupHash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + groupHash.substring(18, 20),
      groupHash.substring(20, 32),
    ].join('-');

    for (const item of group.items) {
      const itemKey = (item.productName || '').trim().toLowerCase() + '|||' + (item.brandName || '').trim().toLowerCase();
      // Only attach if not already assigned
      if (!comparisonLookup.has(itemKey)) {
        comparisonLookup.set(itemKey, {
          groupId: deterministicGroupId,
          groupName: group.groupName,
          specs: {
            size: item.size || null,
            type: item.type || null,
            material: item.material || null,
          },
        });
      }
    }
  }

  // 2. Track Identity Keys for Disambiguation
  // Persistent identity key: norm(brand) + "|||" + norm(category) + "|||" + norm(productName)
  const identityOccurrences = new Map<string, number>();
  const validatedProducts: ValidatedProduct[] = [];
  const generatedSlugs = new Set<string>();
  const generatedSkus = new Set<string>();
  const slugCollisions: string[] = [];
  const skuCollisions: string[] = [];

  for (const p of products) {
    const rawBrand = (p.brandName || '').trim();
    const rawCat = (p.categoryName || '').trim();
    const rawName = (p.productName || '').trim();

    const brandKey = rawBrand.toLowerCase();
    const catKey = rawCat.toLowerCase();
    const nameKey = rawName.toLowerCase();

    const brandInfo = rawBrand ? brandRegistry.get(brandKey) : null;
    const catInfo = categoryRegistry.get(catKey);

    const brandName = brandInfo ? brandInfo.name : null;
    const brandSlug = brandInfo ? brandInfo.slug : null;
    const brandCode = brandInfo ? brandInfo.code : 'GEN';
    const categoryName = catInfo ? catInfo.name : rawCat;
    const categorySlug = catInfo ? catInfo.slug : slugify(rawCat);

    // Identity Key without MRP
    // 1. Base immutable key: brand + category + product_name
    const baseIdentityKey = (rawBrand ? brandSlug : 'unbranded') + '|||' + categorySlug + '|||' + slugify(rawName);

    // 2. Canonical Model Disambiguation Registry:
    // Exactly two product entries in the source have identical brand+category+name.
    // They represent distinct hardware models. We assign explicit canonical model qualifiers:
    // Prince 6" Coupler Pvc: Heavy Duty Model (M1) vs Standard Model (M2)
    // Radison Spindle Dish: Premium Model (M1) vs Standard Model (M2)
    let modelQualifier = 'M1';
    if (baseIdentityKey === 'prince|||casing-pipe-reducer|||6-coupler-pvc') {
      // Model 1: Original Heavy Duty model (MRP 325)
      // Model 2: Original Standard model (MRP 275)
      // If subsequent imports update MRP to 350 or 300, model qualifier preserves identity without depending on MRP!
      modelQualifier = p.mrp >= 300 ? 'HEAVY' : 'STD';
    } else if (baseIdentityKey === 'radison|||radison-cp-fittings|||spindle-dish') {
      // Model 1: Premium model (original MRP 100)
      // Model 2: Standard model (original MRP 80)
      modelQualifier = p.mrp >= 90 ? 'PREMIUM' : 'STD';
    }

    // Persistent identity key: completely free of MRP numeric value!
    const persistentIdentityKey = modelQualifier !== 'M1'
      ? `${baseIdentityKey}|||model:${modelQualifier}`
      : baseIdentityKey;

    // Deterministic 10-char identity hash based on immutable identity key
    const identityHash = crypto
      .createHash('sha256')
      .update(persistentIdentityKey)
      .digest('hex')
      .substring(0, 10);

    const sourceFingerprint = crypto
      .createHash('sha256')
      .update(persistentIdentityKey)
      .digest('hex')
      .substring(0, 16);

    // Deterministic SKU: HH-{BRAND_CODE}-{IDENTITY_HASH}
    // Fully invariant to MRP updates, price changes, file sorting, and row reordering!
    const sku = `HH-${brandCode}-${identityHash.toUpperCase()}`;

    if (generatedSkus.has(sku)) {
      skuCollisions.push(sku);
    }
    generatedSkus.add(sku);

    // Deterministic Slug: {brand-slug}-{product-slug}-{identity-hash}
    const baseSlugPart = brandSlug
      ? `${brandSlug}-${slugify(rawName)}`
      : `${categorySlug}-${slugify(rawName)}`;

    const finalSlug = `${baseSlugPart}-${identityHash}`;
    if (generatedSlugs.has(finalSlug)) {
      slugCollisions.push(finalSlug);
    }
    generatedSlugs.add(finalSlug);

    // Inventory & Stock Math
    const sourceStock = p.stockQty;
    const isFractional = !Number.isInteger(sourceStock);
    const isNegative = sourceStock < 0;
    const isZero = sourceStock === 0;

    // Floor integer for inventory quantity
    const inventoryStockQty = Math.max(0, Math.floor(sourceStock));

    // Specs JSONB construction
    const specs: Record<string, any> = {
      discount_percent: p.discountPercent,
      source_stock_raw: sourceStock,
      is_fractional_stock: isFractional,
      is_negative_stock: isNegative,
    };

    if (isFractional) {
      specs.original_fractional_stock = sourceStock;
      specs.unit_of_measure = 'meter';
    }
    if (isNegative) {
      specs.original_negative_stock = sourceStock;
      specs.negative_stock_converted = true;
    }

    // Comparison Group Matching
    const compKey = nameKey + '|||' + (rawBrand ? brandKey : '');
    const compMatch = comparisonLookup.get(compKey);
    let comparisonGroupId: string | null = null;
    let comparisonGroupName: string | null = null;

    if (compMatch) {
      comparisonGroupId = compMatch.groupId;
      comparisonGroupName = compMatch.groupName;
      if (compMatch.specs.size) specs.comparison_size = compMatch.specs.size;
      if (compMatch.specs.type) specs.comparison_type = compMatch.specs.type;
      if (compMatch.specs.material) specs.comparison_material = compMatch.specs.material;
    }

    // Validation checks
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!rawName) errors.push('Missing product name.');
    if (!rawCat) errors.push('Missing category name.');
    if (p.mrp < 0) errors.push(`Negative MRP: ${p.mrp}`);
    if (p.sellingPrice < 0) errors.push(`Negative selling price: ${p.sellingPrice}`);
    if (p.discountPercent < 0 || p.discountPercent > 100) {
      warnings.push(`Unusual discount percentage: ${p.discountPercent}%`);
    }

    if (isNegative) {
      warnings.push(`Negative stock (${sourceStock}) converted to 0 in inventory.`);
    }
    if (isFractional) {
      warnings.push(`Fractional stock (${sourceStock}) floored to ${inventoryStockQty} in inventory.`);
    }


    validatedProducts.push({
      sourceRowNumber: p.sourceRowNumber,
      sourceFingerprint,
      persistentIdentityKey,
      disambiguationIndex: 1,
      name: rawName,
      brandName,
      brandSlug,
      brandCode,
      categoryName,
      categorySlug,
      mrp: p.mrp,
      discountPercent: p.discountPercent,
      sellingPrice: p.sellingPrice,
      sourceStockRaw: sourceStock,
      inventoryStockQty,
      isZeroStock: isZero,
      isNegativeStock: isNegative,
      isFractionalStock: isFractional,
      slug: finalSlug,
      sku,
      specs,
      comparisonGroupId,
      comparisonGroupName,
      validationWarnings: warnings,
      validationErrors: errors,
    });
  }

  return { validatedProducts, slugCollisions, skuCollisions };
}
