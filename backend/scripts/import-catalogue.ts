import fs from 'fs';
import path from 'path';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from '../src/config/supabase';

/**
 * Standard Catalogue Row structure parsed from source Excel/CSV.
 */
export interface RawCatalogueRow {
  category?: string;
  brand?: string;
  productName: string;
  sku?: string;
  description?: string;
  salePrice: number; // MRP
  saleDiscount?: number; // Fixed INR discount
  unit?: string;
  material?: string;
  diameter?: string;
  length?: string;
  pressureRating?: string;
  technicalStandard?: string;
  intendedApplication?: string;
  comparisonGroupId?: string;
  stock?: number;
  imageUrl?: string;
  isVariant?: boolean;
  parentSku?: string;
  variantName?: string;
  variantAttributes?: Record<string, string>;
  extraSpecs?: Record<string, string>;
}

export interface NormalizedProductPayload {
  name: string;
  slug: string;
  sku: string | null;
  description: string;
  categoryName: string;
  brandName: string | null;
  basePrice: number; // MRP - discount
  compareAtPrice: number; // MRP
  unit: string;
  unitOfSale: string;
  material: string | null;
  diameter: string | null;
  length: string | null;
  pressureRating: string | null;
  technicalStandard: string | null;
  intendedApplication: string | null;
  comparisonGroupId: string | null;
  imageUrl: string | null;
  specs: Record<string, string>;
  initialStock: number;
  isVariant: boolean;
  parentSku: string | null;
  variantName: string | null;
  variantAttributes: Record<string, string>;
}

export interface ValidationErrorItem {
  rowIndex: number;
  identifier: string;
  field: string;
  issue: string;
  receivedValue?: any;
}

export interface ImportValidationReport {
  timestamp: string;
  mode: 'dry-run' | 'apply-sample' | 'live';
  totalRowsRead: number;
  validRowsCount: number;
  invalidRowsCount: number;
  distinctCategoriesCount: number;
  distinctBrandsCount: number;
  slugCollisionsCount: number;
  skuCollisionsCount: number;
  errors: ValidationErrorItem[];
  categoriesSummary: string[];
  brandsSummary: string[];
  samplePayloads: NormalizedProductPayload[];
}

export interface SampleImportResult {
  success: boolean;
  mode: 'apply-sample';
  timestamp: string;
  categoriesCreated: number;
  categoriesExisting: number;
  brandsCreated: number;
  brandsExisting: number;
  productsCreated: number;
  productsExisting: number;
  inventoryCreated: number;
  inventoryExisting: number;
  items: {
    name: string;
    slug: string;
    basePrice: number;
    compareAtPrice: number;
    stock: number;
    status: 'created' | 'existing';
  }[];
}

/**
 * Maximum items allowed for sample import mode
 */
export const MAX_SAMPLE_IMPORT_ITEMS = 10;

/**
 * Helper to generate URL-safe kebab-case slugs.
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Validates and normalizes catalogue data.
 * Pure function with zero DB mutations, ideal for dry-run and automated testing.
 */
export function validateAndNormalizeCatalogue(
  rows: RawCatalogueRow[]
): { report: ImportValidationReport; normalizedItems: NormalizedProductPayload[] } {
  const errors: ValidationErrorItem[] = [];
  const normalizedItems: NormalizedProductPayload[] = [];
  const seenSkus = new Set<string>();
  const seenSlugs = new Set<string>();
  const categoriesSet = new Set<string>();
  const brandsSet = new Set<string>();

  let slugCollisionsCount = 0;
  let skuCollisionsCount = 0;

  rows.forEach((row, idx) => {
    const rowNum = idx + 1;
    const identifier = row.sku || row.productName || `Row-${rowNum}`;

    // 1. Mandatory Product Name
    if (!row.productName || row.productName.trim() === '') {
      errors.push({
        rowIndex: rowNum,
        identifier,
        field: 'productName',
        issue: 'Product Name is missing or empty.',
        receivedValue: row.productName,
      });
      return;
    }

    // 2. Mandatory Category
    if (!row.category || row.category.trim() === '') {
      errors.push({
        rowIndex: rowNum,
        identifier,
        field: 'category',
        issue: 'Category is missing or empty.',
        receivedValue: row.category,
      });
      return;
    }
    const cleanCategory = row.category.trim();
    categoriesSet.add(cleanCategory);

    // Brand tracking
    const cleanBrand = row.brand && row.brand.trim() !== '' ? row.brand.trim() : null;
    if (cleanBrand) brandsSet.add(cleanBrand);

    // 3. Pricing Validation (MRP, Fixed Rupee Discount, Net Price)
    const mrp = Number(row.salePrice);
    if (isNaN(mrp) || mrp < 0) {
      errors.push({
        rowIndex: rowNum,
        identifier,
        field: 'salePrice',
        issue: 'Sale Price (MRP) must be a non-negative number.',
        receivedValue: row.salePrice,
      });
      return;
    }

    const discount = row.saleDiscount != null ? Number(row.saleDiscount) : 0;
    if (isNaN(discount) || discount < 0) {
      errors.push({
        rowIndex: rowNum,
        identifier,
        field: 'saleDiscount',
        issue: 'Sale Discount must be a non-negative number.',
        receivedValue: row.saleDiscount,
      });
      return;
    }

    if (discount > mrp) {
      errors.push({
        rowIndex: rowNum,
        identifier,
        field: 'saleDiscount',
        issue: `Sale Discount (₹${discount}) cannot exceed MRP (₹${mrp}).`,
        receivedValue: { mrp, discount },
      });
      return;
    }

    const sellingPrice = Math.round((mrp - discount) * 100) / 100;

    // 4. SKU Uniqueness & Validation
    const cleanSku = row.sku && row.sku.trim() !== '' ? row.sku.trim().toUpperCase() : null;
    if (cleanSku) {
      if (seenSkus.has(cleanSku)) {
        skuCollisionsCount++;
        errors.push({
          rowIndex: rowNum,
          identifier,
          field: 'sku',
          issue: `Duplicate SKU detected: '${cleanSku}'.`,
          receivedValue: cleanSku,
        });
        return;
      }
      seenSkus.add(cleanSku);
    }

    // 5. Slug Generation & Collision Avoidance
    const baseSlugText = cleanBrand
      ? `${cleanBrand} ${row.productName}`
      : row.productName;
    let slug = generateSlug(baseSlugText);
    if (!slug) slug = `product-${rowNum}`;

    if (seenSlugs.has(slug)) {
      slugCollisionsCount++;
      if (cleanSku) {
        slug = `${slug}-${generateSlug(cleanSku)}`;
      } else {
        slug = `${slug}-${rowNum}`;
      }
    }
    seenSlugs.add(slug);

    // 6. Stock Normalization
    let stock = 0;
    if (row.stock != null) {
      const parsedStock = Number(row.stock);
      if (isNaN(parsedStock) || parsedStock < 0) {
        errors.push({
          rowIndex: rowNum,
          identifier,
          field: 'stock',
          issue: 'Stock must be a non-negative integer.',
          receivedValue: row.stock,
        });
        return;
      }
      stock = Math.floor(parsedStock);
    }

    // 7. Specifications preservation (including Bharat sink full size if present in extraSpecs)
    const specs: Record<string, string> = {
      mrp: mrp.toFixed(2),
      discount_amount: discount.toFixed(2),
      discount_type: 'fixed_inr',
      ...(row.extraSpecs || {}),
    };

    normalizedItems.push({
      name: row.productName.trim(),
      slug,
      sku: cleanSku,
      description: row.description?.trim() || '',
      categoryName: cleanCategory,
      brandName: cleanBrand,
      basePrice: sellingPrice,
      compareAtPrice: mrp,
      unit: row.unit?.trim().toLowerCase() || 'piece',
      unitOfSale: row.unit?.trim().toLowerCase() || 'piece',
      material: row.material?.trim() || null,
      diameter: row.diameter?.trim() || null,
      length: row.length?.trim() || null,
      pressureRating: row.pressureRating?.trim() || null,
      technicalStandard: row.technicalStandard?.trim() || null,
      intendedApplication: row.intendedApplication?.trim() || null,
      comparisonGroupId: row.comparisonGroupId?.trim() || null,
      imageUrl: row.imageUrl?.trim() || null,
      specs,
      initialStock: stock,
      isVariant: Boolean(row.isVariant),
      parentSku: row.parentSku?.trim() || null,
      variantName: row.variantName?.trim() || null,
      variantAttributes: row.variantAttributes || {},
    });
  });

  const report: ImportValidationReport = {
    timestamp: new Date().toISOString(),
    mode: 'dry-run',
    totalRowsRead: rows.length,
    validRowsCount: normalizedItems.length,
    invalidRowsCount: errors.length,
    distinctCategoriesCount: categoriesSet.size,
    distinctBrandsCount: brandsSet.size,
    slugCollisionsCount,
    skuCollisionsCount,
    errors,
    categoriesSummary: Array.from(categoriesSet),
    brandsSummary: Array.from(brandsSet),
    samplePayloads: normalizedItems.slice(0, 5),
  };

  return { report, normalizedItems };
}

/**
 * Resolves or creates a category by unique slug.
 */
export async function resolveOrCreateCategory(
  client: SupabaseClient,
  categoryName: string
): Promise<string> {
  const slug = generateSlug(categoryName);
  
  // 1. Look up existing
  const { data: existing, error: selectErr } = await client
    .from('categories')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (selectErr) {
    throw new Error(`Failed to query category '${slug}': ${selectErr.message}`);
  }

  if (existing) {
    return existing.id;
  }

  // 2. Insert new category
  const { data: inserted, error: insertErr } = await client
    .from('categories')
    .insert({
      name: categoryName,
      slug,
      description: '',
      is_active: true,
      sort_order: 0,
    })
    .select('id')
    .single();

  if (insertErr) {
    // Check if created concurrently
    if (insertErr.code === '23505') {
      const { data: retry } = await client.from('categories').select('id').eq('slug', slug).single();
      if (retry) return retry.id;
    }
    throw new Error(`Failed to create category '${categoryName}': ${insertErr.message}`);
  }

  return inserted.id;
}

/**
 * Resolves or creates a brand by unique slug.
 */
export async function resolveOrCreateBrand(
  client: SupabaseClient,
  brandName: string
): Promise<string> {
  const slug = generateSlug(brandName);

  // 1. Look up existing
  const { data: existing, error: selectErr } = await client
    .from('brands')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (selectErr) {
    throw new Error(`Failed to query brand '${slug}': ${selectErr.message}`);
  }

  if (existing) {
    return existing.id;
  }

  // 2. Insert new brand
  const { data: inserted, error: insertErr } = await client
    .from('brands')
    .insert({
      name: brandName,
      slug,
      description: '',
      is_active: true,
      display_order: 0,
    })
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      const { data: retry } = await client.from('brands').select('id').eq('slug', slug).single();
      if (retry) return retry.id;
    }
    throw new Error(`Failed to create brand '${brandName}': ${insertErr.message}`);
  }

  return inserted.id;
}

/**
 * Applies sample items to database idempotently using administrative Supabase client.
 */
export async function applySampleToDatabase(
  items: NormalizedProductPayload[],
  adminClient: SupabaseClient
): Promise<SampleImportResult> {
  let categoriesCreated = 0;
  let categoriesExisting = 0;
  let brandsCreated = 0;
  let brandsExisting = 0;
  let productsCreated = 0;
  let productsExisting = 0;
  let inventoryCreated = 0;
  let inventoryExisting = 0;

  const itemResults: SampleImportResult['items'] = [];

  for (const item of items) {
    // 1. Resolve Category
    const categorySlug = generateSlug(item.categoryName);
    const { data: catExists } = await adminClient.from('categories').select('id').eq('slug', categorySlug).maybeSingle();
    const categoryId = await resolveOrCreateCategory(adminClient, item.categoryName);
    if (catExists) {
      categoriesExisting++;
    } else {
      categoriesCreated++;
    }

    // 2. Resolve Brand if present
    let brandId: string | null = null;
    if (item.brandName) {
      const brandSlug = generateSlug(item.brandName);
      const { data: brandExists } = await adminClient.from('brands').select('id').eq('slug', brandSlug).maybeSingle();
      brandId = await resolveOrCreateBrand(adminClient, item.brandName);
      if (brandExists) {
        brandsExisting++;
      } else {
        brandsCreated++;
      }
    }

    // 3. Upsert / Check Product Existence
    const { data: existingProd, error: prodSelectErr } = await adminClient
      .from('products')
      .select('id, base_price, compare_at_price')
      .eq('slug', item.slug)
      .maybeSingle();

    if (prodSelectErr) {
      throw new Error(`Error checking product '${item.slug}': ${prodSelectErr.message}`);
    }

    let productId: string;
    let productStatus: 'created' | 'existing';

    if (existingProd) {
      productId = existingProd.id;
      productStatus = 'existing';
      productsExisting++;
    } else {
      const { data: newProd, error: prodInsertErr } = await adminClient
        .from('products')
        .insert({
          name: item.name,
          slug: item.slug,
          sku: item.sku || null,
          description: item.description,
          brand_id: brandId,
          category_id: categoryId,
          base_price: item.basePrice,
          compare_at_price: item.compareAtPrice,
          unit: item.unit,
          unit_of_sale: item.unitOfSale,
          material: item.material,
          diameter: item.diameter,
          length: item.length,
          pressure_rating: item.pressureRating,
          technical_standard: item.technicalStandard,
          intended_application: item.intendedApplication,
          comparison_group_id: item.comparisonGroupId,
          image_url: item.imageUrl,
          images: [],
          specs: item.specs,
          is_featured: false,
          is_active: true,
        })
        .select('id')
        .single();

      if (prodInsertErr) {
        throw new Error(`Failed to insert product '${item.name}': ${prodInsertErr.message}`);
      }

      productId = newProd.id;
      productStatus = 'created';
      productsCreated++;
    }

    // 4. Inventory Record Synchronization
    // Guarantees strictly 1 product-level record where variant_id IS NULL
    const { data: existingInv, error: invSelectErr } = await adminClient
      .from('inventory')
      .select('id, quantity_available')
      .eq('product_id', productId)
      .is('variant_id', null)
      .maybeSingle();

    if (invSelectErr) {
      throw new Error(`Error checking inventory for product '${item.name}': ${invSelectErr.message}`);
    }

    if (existingInv) {
      // Preserve existing stock on rerun — DO NOT overwrite or reset to zero
      inventoryExisting++;
    } else {
      const { error: invInsertErr } = await adminClient
        .from('inventory')
        .insert({
          product_id: productId,
          variant_id: null,
          quantity_available: item.initialStock,
          quantity_reserved: 0,
        });

      if (invInsertErr) {
        throw new Error(`Failed to initialize inventory for '${item.name}': ${invInsertErr.message}`);
      }
      inventoryCreated++;
    }

    itemResults.push({
      name: item.name,
      slug: item.slug,
      basePrice: item.basePrice,
      compareAtPrice: item.compareAtPrice,
      stock: existingInv ? existingInv.quantity_available : item.initialStock,
      status: productStatus,
    });
  }

  return {
    success: true,
    mode: 'apply-sample',
    timestamp: new Date().toISOString(),
    categoriesCreated,
    categoriesExisting,
    brandsCreated,
    brandsExisting,
    productsCreated,
    productsExisting,
    inventoryCreated,
    inventoryExisting,
    items: itemResults,
  };
}

/**
 * Command-line runner supporting --dry-run and --apply-sample
 */
export async function runImporterCli(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isApplySample = args.includes('--apply-sample');
  const filePathArg = args.find((arg) => arg.startsWith('--file='));
  const filePath = filePathArg ? filePathArg.split('=')[1] : null;

  if (!filePath) {
    console.log('Usage:');
    console.log('  Dry-run:       npx tsx scripts/import-catalogue.ts --file=<path> --dry-run');
    console.log('  Apply sample:  npx tsx scripts/import-catalogue.ts --file=<path> --apply-sample');
    process.exit(0);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: File not found at '${resolved}'`);
    process.exit(1);
  }

  const rawContent = fs.readFileSync(resolved, 'utf-8');
  const rows: RawCatalogueRow[] = JSON.parse(rawContent);

  // 1. Dry Run Mode
  if (isDryRun) {
    const { report } = validateAndNormalizeCatalogue(rows);
    report.mode = 'dry-run';
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // 2. Gated Apply Sample Mode
  if (isApplySample) {
    // Gate 1: Check row count safety limit (Must be sample size <= MAX_SAMPLE_IMPORT_ITEMS)
    if (rows.length > MAX_SAMPLE_IMPORT_ITEMS) {
      console.error(
        `Error: --apply-sample is restricted to controlled test samples of at most ${MAX_SAMPLE_IMPORT_ITEMS} items.`
      );
      console.error(`The provided file contains ${rows.length} rows. Rejecting full catalogue in sample mode.`);
      process.exit(1);
    }

    // Gate 2: Validate all rows before attempting database connection
    const { report, normalizedItems } = validateAndNormalizeCatalogue(rows);
    if (report.invalidRowsCount > 0) {
      console.error('Validation failed with errors. Aborting sample import:');
      console.error(JSON.stringify(report.errors, null, 2));
      process.exit(1);
    }

    // Gate 3: Check administrative Supabase credentials
    if (!isSupabaseAdminConfigured()) {
      console.error('Error: Server-side Supabase administrative client is not configured.');
      console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in backend/.env for --apply-sample.');
      process.exit(1);
    }

    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      console.error('Error: Failed to initialize administrative Supabase client.');
      process.exit(1);
    }

    try {
      console.log(`Applying ${normalizedItems.length} sample items to Supabase database...`);
      const result = await applySampleToDatabase(normalizedItems, adminClient);
      console.log('\n--- SAMPLE IMPORT COMPLETED SUCCESSFULLY ---');
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(`Sample import failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // 3. Reject any other unrecognized live attempt
  console.warn('NOTICE: Direct live writes without --apply-sample are prohibited.');
  console.warn('Use --dry-run to validate or --apply-sample to import the approved test sample.');
  process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('import-catalogue.ts')) {
  runImporterCli().catch((err) => {
    console.error('Fatal CLI execution error:', err.message);
    process.exit(1);
  });
}
