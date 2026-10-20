import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from '../src/config/supabase';
import {
  generateSlug,
  resolveOrCreateCategory,
  resolveOrCreateBrand,
  RawCatalogueRow,
  NormalizedProductPayload,
  ValidationErrorItem,
} from './import-catalogue';

export interface WorkbookInspectionSummary {
  filePath: string;
  sheetNames: string[];
  productWorksheet: string;
  totalRows: number;
  headerColumns: string[];
  distinctCategoriesCount: number;
  distinctBrandsCount: number;
  distinctSubcategoriesCount: number;
  skuCount: number;
  pricingAudit: {
    validPricingCount: number;
    invalidPricingCount: number;
    discountExceedsMrpCount: number;
    negativeSellingPriceCount: number;
  };
  stockAudit: {
    stockSheetName: string;
    stockRowsCount: number;
    exactMatchesIdentified: number;
    defaultZeroStockAssignedCount: number;
  };
  categories: string[];
  brands: string[];
}

export interface CatalogueSeedingReport {
  mode: 'inspect' | 'dry-run' | 'apply-sample' | 'apply-catalogue';
  timestamp: string;
  workbookFile: string;
  totalRowsRead: number;
  validRowsCount: number;
  invalidRowsCount: number;
  duplicateIdentifiersCount: number;
  categoriesFound: number;
  brandsFound: number;
  stockAssignedCount: number;
  stockZeroCount: number;
  errors: ValidationErrorItem[];
  samplePreview: NormalizedProductPayload[];
  executionResult?: {
    success: boolean;
    categoriesCreated: number;
    categoriesExisting: number;
    brandsCreated: number;
    brandsExisting: number;
    productsCreated: number;
    productsExisting: number;
    inventoryCreated: number;
    inventoryExisting: number;
    batchCount: number;
  };
}

/**
 * Resolves workbook path searching project root, parent directory, or explicitly specified path.
 */
export function resolveWorkbookPath(overridePath?: string): string {
  if (overridePath) {
    const resolved = path.resolve(overridePath);
    if (fs.existsSync(resolved)) return resolved;
    throw new Error(`Workbook not found at specified path: ${overridePath}`);
  }

  const defaultLocations = [
    path.resolve(process.cwd(), '../Hindustan_Hardware_DB_Import_Catalog_v2.xlsx'),
    path.resolve(process.cwd(), 'Hindustan_Hardware_DB_Import_Catalog_v2.xlsx'),
    path.resolve(__dirname, '../../Hindustan_Hardware_DB_Import_Catalog_v2.xlsx'),
    path.resolve('D:/Dowbloads/Hardware E-Commerce Website Prototype/Hindustan_Hardware_DB_Import_Catalog_v2.xlsx'),
    path.resolve('D:/Dowbloads/Hindustan_Hardware_DB_Import_Catalog_v2.xlsx'),
  ];

  for (const loc of defaultLocations) {
    if (fs.existsSync(loc)) return loc;
  }

  throw new Error(
    'Workbook Hindustan_Hardware_DB_Import_Catalog_v2.xlsx not found in standard project directories.'
  );
}

/**
 * Inspects the Excel workbook without mutating anything.
 */
export function inspectWorkbook(workbookPath: string): WorkbookInspectionSummary {
  const wb = xlsx.readFile(workbookPath);
  const productSheetName = wb.SheetNames.includes('Products_Import')
    ? 'Products_Import'
    : wb.SheetNames[1] || wb.SheetNames[0];

  const ws = wb.Sheets[productSheetName];
  if (!ws) throw new Error(`Worksheet '${productSheetName}' not found in workbook.`);

  const rawRows: any[] = xlsx.utils.sheet_to_json(ws);
  const headerMatrix: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });
  const headers: string[] = (headerMatrix[0] || []).map((h) => String(h || '').trim());

  const categories = new Set<string>();
  const brands = new Set<string>();
  const subcategories = new Set<string>();
  let skuCount = 0;
  let invalidPricingCount = 0;
  let discountExceedsMrpCount = 0;
  let negativeSellingPriceCount = 0;
  let validPricingCount = 0;

  for (const r of rawRows) {
    if (r.Category) categories.add(String(r.Category).trim());
    if (r.Subcategory) subcategories.add(String(r.Subcategory).trim());
    if (r.Brand) brands.add(String(r.Brand).trim());
    if (r.SKU && String(r.SKU).trim() !== '') skuCount++;

    const mrp = Number(r.MRP_INR);
    const disc = Number(r.Discount_Amount_INR || 0);

    if (isNaN(mrp) || mrp < 0 || isNaN(disc) || disc < 0) {
      invalidPricingCount++;
    } else if (disc > mrp) {
      discountExceedsMrpCount++;
      negativeSellingPriceCount++;
    } else {
      validPricingCount++;
    }
  }

  // Stock Sheet Inspection
  let stockRowsCount = 0;
  let exactStockMatches = 0;
  if (wb.SheetNames.includes('Stock_Review')) {
    const stockWs = wb.Sheets['Stock_Review'];
    const stockRows: any[] = xlsx.utils.sheet_to_json(stockWs);
    stockRowsCount = stockRows.length;
    exactStockMatches = stockRows.filter((sr) =>
      sr.Match_Status && String(sr.Match_Status).includes('Exact')
    ).length;
  }

  return {
    filePath: workbookPath,
    sheetNames: wb.SheetNames,
    productWorksheet: productSheetName,
    totalRows: rawRows.length,
    headerColumns: headers,
    distinctCategoriesCount: categories.size,
    distinctBrandsCount: brands.size,
    distinctSubcategoriesCount: subcategories.size,
    skuCount,
    pricingAudit: {
      validPricingCount,
      invalidPricingCount,
      discountExceedsMrpCount,
      negativeSellingPriceCount,
    },
    stockAudit: {
      stockSheetName: 'Stock_Review',
      stockRowsCount,
      exactMatchesIdentified: exactStockMatches,
      defaultZeroStockAssignedCount: rawRows.length - exactStockMatches,
    },
    categories: Array.from(categories),
    brands: Array.from(brands),
  };
}

/**
 * Extracts and maps rows from Products_Import sheet to RawCatalogueRow array.
 */
export function extractCatalogueRowsFromWorkbook(
  workbookPath: string,
  options?: {
    stockMap?: Map<string, number>;
  }
): RawCatalogueRow[] {
  const wb = xlsx.readFile(workbookPath);
  const sheetName = wb.SheetNames.includes('Products_Import')
    ? 'Products_Import'
    : wb.SheetNames[1] || wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Worksheet '${sheetName}' not found.`);

  const rawData: any[] = xlsx.utils.sheet_to_json(ws);

  // Optional stock map derived from Stock_Review exact matches
  let stockMap = options?.stockMap;
  if (!stockMap && wb.SheetNames.includes('Stock_Review')) {
    stockMap = new Map<string, number>();
    const stockWs = wb.Sheets['Stock_Review'];
    const stockRows: any[] = xlsx.utils.sheet_to_json(stockWs);
    for (const sr of stockRows) {
      if (sr.Match_Status && String(sr.Match_Status).includes('Exact') && sr.Matched_Print_Name) {
        const qty = Number(sr.Stock_Qty);
        if (!isNaN(qty) && qty >= 0) {
          stockMap.set(String(sr.Matched_Print_Name).trim().toLowerCase(), qty);
        }
      }
    }
  }

  return rawData.map((r, idx) => {
    const originalName = String(r.Print_Name_Original || '').trim();
    const rawBrand = r.Brand ? String(r.Brand).trim() : undefined;
    // Requirement 3: For the 290 rows whose brand is "Needs review", use brand_id = NULL. Do not create a public brand "Needs review".
    const cleanBrand = (rawBrand && rawBrand.toLowerCase() !== 'needs review') ? rawBrand : undefined;
    const cleanCategory = r.Category ? String(r.Category).trim() : undefined;
    const mrp = Number(r.MRP_INR || 0);
    const disc = Number(r.Discount_Amount_INR || 0);
    const cleanSku = r.SKU ? String(r.SKU).trim() : undefined;

    // Resolve stock from verified stock map or default to 0
    let stock = 0;
    let isStockVerified = false;
    if (stockMap && stockMap.has(originalName.toLowerCase())) {
      stock = stockMap.get(originalName.toLowerCase())!;
      isStockVerified = true;
    }

    // Preservation of technical specs
    const extraSpecs: Record<string, string> = {
      product_type: String(r.Product_Type || '').trim(),
      subcategory: String(r.Subcategory || '').trim(),
      source_file: String(r.Source_File || '').trim(),
      source_row: String(r.Source_Excel_Row || idx + 2),
      stock_verification_status: isStockVerified ? 'verified_from_stock_review' : 'awaiting_stock_verification',
    };
    if (rawBrand && rawBrand.toLowerCase() === 'needs review') {
      extraSpecs.brand_source_note = 'Brand marked Needs review in workbook source; mapped to unbranded (brand_id = NULL)';
    }

    if (r.Size_Extracted) extraSpecs.size = String(r.Size_Extracted).trim();
    if (r.Variant_or_Series) extraSpecs.series = String(r.Variant_or_Series).trim();
    if (r.Unit_of_Sale) extraSpecs.unit_of_sale_note = String(r.Unit_of_Sale).trim();
    if (r.Unit_Notes) extraSpecs.unit_notes = String(r.Unit_Notes).trim();
    if (r.Price_Status) extraSpecs.price_status = String(r.Price_Status).trim();
    if (r.Price_Notes) extraSpecs.price_notes = String(r.Price_Notes).trim();
    if (r.Related_Products_Group_Key) extraSpecs.related_group_key = String(r.Related_Products_Group_Key).trim();

    // Size vs Diameter distinction:
    // If Size_Extracted is a simple diameter like 0.75", 1", 25mm, map to diameter.
    // Otherwise (e.g. 18"x16"x8" or multi-dimension pipe/fittings), keep it in specs.size.
    const rawSize = r.Size_Extracted ? String(r.Size_Extracted).trim() : undefined;
    let diameterVal: string | undefined = undefined;
    if (rawSize) {
      const isSimpleDiameter = /^(\d+(\.\d+)?|\d+\/\d+|\d+\s+\d+\/\d+)\s*(inch|\"|mm|cm)?$/i.test(rawSize);
      if (isSimpleDiameter) {
        diameterVal = rawSize;
      }
    }

    return {
      productName: originalName,
      brand: cleanBrand,
      category: cleanCategory,
      sku: cleanSku,
      salePrice: mrp,
      saleDiscount: disc,
      unit: 'piece',
      diameter: diameterVal,
      comparisonGroupId: r.Related_Products_Group_Key ? String(r.Related_Products_Group_Key).trim() : undefined,
      stock,
      extraSpecs,
    };
  });
}

/**
 * Validates extracted catalogue rows.
 */
export function validateCatalogueRows(
  rows: RawCatalogueRow[]
): {
  validItems: NormalizedProductPayload[];
  invalidErrors: ValidationErrorItem[];
  duplicatesCount: number;
} {
  const validItems: NormalizedProductPayload[] = [];
  const invalidErrors: ValidationErrorItem[] = [];
  const seenSkus = new Set<string>();
  const seenSlugs = new Set<string>();
  let duplicatesCount = 0;

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const identifier = r.sku || r.productName || `Row-${rowNum}`;

    if (!r.productName || r.productName.trim() === '') {
      invalidErrors.push({
        rowIndex: rowNum,
        identifier,
        field: 'productName',
        issue: 'Product name is missing or empty.',
      });
      return;
    }

    if (!r.category || r.category.trim() === '') {
      invalidErrors.push({
        rowIndex: rowNum,
        identifier,
        field: 'category',
        issue: 'Category is missing or empty.',
      });
      return;
    }

    const mrp = Number(r.salePrice);
    const disc = Number(r.saleDiscount || 0);

    if (isNaN(mrp) || mrp <= 0) {
      invalidErrors.push({
        rowIndex: rowNum,
        identifier,
        field: 'MRP_INR',
        issue: 'MRP must be a valid positive number greater than 0.',
        receivedValue: r.salePrice,
      });
      return;
    }

    if (isNaN(disc) || disc < 0) {
      invalidErrors.push({
        rowIndex: rowNum,
        identifier,
        field: 'Discount_Amount_INR',
        issue: 'Discount must be a valid non-negative number.',
        receivedValue: r.saleDiscount,
      });
      return;
    }

    if (r.stock !== undefined && r.stock !== null && (isNaN(Number(r.stock)) || Number(r.stock) < 0)) {
      invalidErrors.push({
        rowIndex: rowNum,
        identifier,
        field: 'stock',
        issue: 'Stock quantity cannot be negative.',
        receivedValue: r.stock,
      });
      return;
    }

    if (disc > mrp) {
      invalidErrors.push({
        rowIndex: rowNum,
        identifier,
        field: 'Discount_Amount_INR',
        issue: `Fixed discount (₹${disc}) exceeds MRP (₹${mrp}), resulting in negative selling price.`,
        receivedValue: { mrp, discount: disc },
      });
      return;
    }

    const sellingPrice = Math.round((mrp - disc) * 100) / 100;
    const cleanSku = r.sku && r.sku.trim() !== '' ? r.sku.trim().toUpperCase() : null;

    if (cleanSku) {
      if (seenSkus.has(cleanSku)) {
        duplicatesCount++;
        invalidErrors.push({
          rowIndex: rowNum,
          identifier,
          field: 'SKU',
          issue: `Duplicate SKU detected: '${cleanSku}'.`,
        });
        return;
      }
      seenSkus.add(cleanSku);
    }

    const baseSlugText = r.brand ? `${r.brand} ${r.productName}` : r.productName;
    let slug = generateSlug(baseSlugText);
    if (!slug) slug = `product-${rowNum}`;

    if (seenSlugs.has(slug)) {
      duplicatesCount++;
      slug = cleanSku ? `${slug}-${generateSlug(cleanSku)}` : `${slug}-${rowNum}`;
    }
    seenSlugs.add(slug);

    const specs: Record<string, string> = {
      mrp: mrp.toFixed(2),
      discount_amount: disc.toFixed(2),
      discount_type: 'fixed_inr',
      ...(r.extraSpecs || {}),
    };

    validItems.push({
      name: r.productName.trim(),
      slug,
      sku: cleanSku,
      description: r.description?.trim() || '',
      categoryName: r.category.trim(),
      brandName: r.brand?.trim() || null,
      basePrice: sellingPrice,
      compareAtPrice: mrp,
      unit: r.unit?.trim().toLowerCase() || 'piece',
      unitOfSale: r.unit?.trim().toLowerCase() || 'piece',
      material: r.material?.trim() || null,
      diameter: r.diameter?.trim() || null,
      length: r.length?.trim() || null,
      pressureRating: r.pressureRating?.trim() || null,
      technicalStandard: r.technicalStandard?.trim() || null,
      intendedApplication: r.intendedApplication?.trim() || null,
      comparisonGroupId: r.comparisonGroupId?.trim() || null,
      imageUrl: r.imageUrl?.trim() || null,
      specs,
      initialStock: r.stock != null && r.stock >= 0 ? Math.floor(r.stock) : 0,
      isVariant: false,
      parentSku: null,
      variantName: null,
      variantAttributes: {},
    });
  });

  return { validItems, invalidErrors, duplicatesCount };
}

/**
 * Batched, transaction-safe database seeder.
 * Runs in batches of 50 to maintain stability and prevent connection timeouts.
 */
export async function seedCatalogueBatch(
  client: SupabaseClient,
  items: NormalizedProductPayload[],
  batchSize = 50
): Promise<CatalogueSeedingReport['executionResult']> {
  let categoriesCreated = 0;
  let categoriesExisting = 0;
  let brandsCreated = 0;
  let brandsExisting = 0;
  let productsCreated = 0;
  let productsExisting = 0;
  let inventoryCreated = 0;
  let inventoryExisting = 0;
  let batchCount = 0;

  // Cache for resolved categories and brands
  const categoryCache = new Map<string, string>();
  const brandCache = new Map<string, string>();

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    batchCount++;

    for (const item of chunk) {
      // 1. Resolve Category
      const catSlug = generateSlug(item.categoryName);
      let categoryId = categoryCache.get(catSlug);
      if (!categoryId) {
        const { data: catExists } = await client
          .from('categories')
          .select('id')
          .eq('slug', catSlug)
          .maybeSingle();

        if (catExists) {
          categoriesExisting++;
          categoryId = catExists.id;
        } else {
          categoryId = await resolveOrCreateCategory(client, item.categoryName);
          categoriesCreated++;
        }
        categoryCache.set(catSlug, categoryId);
      }

      // 2. Resolve Brand
      let brandId: string | null = null;
      if (item.brandName) {
        const brandSlug = generateSlug(item.brandName);
        brandId = brandCache.get(brandSlug) || null;
        if (!brandId) {
          const { data: brandExists } = await client
            .from('brands')
            .select('id')
            .eq('slug', brandSlug)
            .maybeSingle();

          if (brandExists) {
            brandsExisting++;
            brandId = brandExists.id;
          } else {
            brandId = await resolveOrCreateBrand(client, item.brandName);
            brandsCreated++;
          }
          brandCache.set(brandSlug, brandId);
        }
      }

      // 3. Upsert / Resolve Product
      const { data: prodExists } = await client
        .from('products')
        .select('id, base_price, compare_at_price')
        .eq('slug', item.slug)
        .maybeSingle();

      let productId: string;
      if (prodExists) {
        productId = prodExists.id;
        productsExisting++;
      } else {
        const { data: newProd, error: prodErr } = await client
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
            image_url: null,
            images: [],
            specs: item.specs,
            is_featured: false,
            is_active: true,
          })
          .select('id')
          .single();

        if (prodErr) {
          throw new Error(`Failed to insert product '${item.name}': ${prodErr.message}`);
        }
        productId = newProd.id;
        productsCreated++;
      }

      // 4. Product-level inventory synchronization
      const { data: invExists } = await client
        .from('inventory')
        .select('id, quantity_available')
        .eq('product_id', productId)
        .is('variant_id', null)
        .maybeSingle();

      if (invExists) {
        inventoryExisting++;
      } else {
        const { error: invErr } = await client.from('inventory').insert({
          product_id: productId,
          variant_id: null,
          quantity_available: item.initialStock,
          quantity_reserved: 0,
        });

        if (invErr) {
          throw new Error(`Failed to initialize inventory for product '${item.name}': ${invErr.message}`);
        }
        inventoryCreated++;
      }
    }
  }

  return {
    success: true,
    categoriesCreated,
    categoriesExisting,
    brandsCreated,
    brandsExisting,
    productsCreated,
    productsExisting,
    inventoryCreated,
    inventoryExisting,
    batchCount,
  };
}

/**
 * Main CLI entry point.
 */
export async function runSeederCli(): Promise<void> {
  const args = process.argv.slice(2);
  const isInspect = args.includes('--inspect');
  const isDryRun = args.includes('--dry-run');
  const isApplySample = args.includes('--apply-sample');
  const isApplyCatalogue = args.includes('--apply-catalogue');

  const fileArg = args.find((a) => a.startsWith('--file='));
  const customFilePath = fileArg ? fileArg.split('=')[1] : undefined;

  const workbookPath = resolveWorkbookPath(customFilePath);

  // Mode 1: --inspect
  if (isInspect) {
    const summary = inspectWorkbook(workbookPath);
    console.log('\n--- HINDUSTAN HARDWARE WORKBOOK INSPECTION SUMMARY ---');
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  // Mode 2: --dry-run
  if (isDryRun) {
    const extracted = extractCatalogueRowsFromWorkbook(workbookPath);
    const { validItems, invalidErrors, duplicatesCount } = validateCatalogueRows(extracted);

    const report: CatalogueSeedingReport = {
      mode: 'dry-run',
      timestamp: new Date().toISOString(),
      workbookFile: workbookPath,
      totalRowsRead: extracted.length,
      validRowsCount: validItems.length,
      invalidRowsCount: invalidErrors.length,
      duplicateIdentifiersCount: duplicatesCount,
      categoriesFound: new Set(validItems.map((i) => i.categoryName)).size,
      brandsFound: new Set(validItems.map((i) => i.brandName).filter(Boolean)).size,
      stockAssignedCount: validItems.filter((i) => i.initialStock > 0).length,
      stockZeroCount: validItems.filter((i) => i.initialStock === 0).length,
      errors: invalidErrors.slice(0, 20),
      samplePreview: validItems.slice(0, 5),
    };

    console.log('\n--- CATALOGUE VALIDATION & DRY-RUN REPORT ---');
    console.log(JSON.stringify(report, null, 2));
    if (invalidErrors.length > 20) {
      console.warn(`\n[Note: Truncated ${invalidErrors.length - 20} additional invalid pricing errors for brevity]`);
    }
    return;
  }

  // Mode 3: --apply-sample
  if (isApplySample) {
    if (!isSupabaseAdminConfigured()) {
      console.error('Error: Administrative Supabase client is not configured.');
      console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in backend/.env.');
      process.exit(1);
    }

    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      console.error('Error: Failed to instantiate admin client.');
      process.exit(1);
    }

    // Load sample file (5 items)
    const sampleFilePath = path.resolve(__dirname, 'sample_products_from_excel.json');
    if (!fs.existsSync(sampleFilePath)) {
      console.error(`Sample file not found at '${sampleFilePath}'.`);
      process.exit(1);
    }

    const sampleRaw: RawCatalogueRow[] = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));
    const { validItems, invalidErrors } = validateCatalogueRows(sampleRaw);
    if (invalidErrors.length > 0) {
      console.error('Validation errors found in sample items. Aborting:');
      console.error(invalidErrors);
      process.exit(1);
    }

    console.log(`Applying approved 5-product sample to Supabase database (${validItems.length} items)...`);
    const result = await seedCatalogueBatch(adminClient, validItems, 10);
    console.log('\n--- SAMPLE SEEDING COMPLETED SUCCESSFULLY ---');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Mode 4: --apply-catalogue (Guarded)
  if (isApplyCatalogue) {
    const confirmationArg = args.includes('--confirm-full-import');
    if (!confirmationArg) {
      console.error('\nSAFETY GATE: Full catalogue import requires explicit confirmation flag:');
      console.error('  --apply-catalogue --confirm-full-import');
      console.error('Aborting live catalogue import.');
      process.exit(1);
    }

    if (!isSupabaseAdminConfigured()) {
      console.error('Error: Administrative Supabase client is not configured in backend/.env.');
      process.exit(1);
    }

    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      console.error('Error: Admin client could not be initialized.');
      process.exit(1);
    }

    const extracted = extractCatalogueRowsFromWorkbook(workbookPath);
    const { validItems, invalidErrors } = validateCatalogueRows(extracted);

    console.log(`Starting full catalogue batch import: ${validItems.length} valid items...`);
    if (invalidErrors.length > 0) {
      console.warn(`Excluding ${invalidErrors.length} invalid items (negative pricing / discount > MRP).`);
    }

    const result = await seedCatalogueBatch(adminClient, validItems, 50);
    console.log('\n--- FULL CATALOGUE SEEDING COMPLETED ---');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Default help
  console.log('Hindustan Hardware & Sanitary — Excel Catalogue Seeder');
  console.log('Usage:');
  console.log('  Inspect workbook:   npx tsx scripts/seed-excel-catalogue.ts --inspect');
  console.log('  Dry-run full file:  npx tsx scripts/seed-excel-catalogue.ts --dry-run');
  console.log('  Apply sample (5):   npx tsx scripts/seed-excel-catalogue.ts --apply-sample');
  console.log('  Apply full catalog: npx tsx scripts/seed-excel-catalogue.ts --apply-catalogue --confirm-full-import');
}

if (process.argv[1] && process.argv[1].endsWith('seed-excel-catalogue.ts')) {
  runSeederCli().catch((err) => {
    console.error('Fatal seeder error:', err.message);
    process.exit(1);
  });
}
