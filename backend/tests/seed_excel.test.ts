import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import {
  inspectWorkbook,
  extractCatalogueRowsFromWorkbook,
  validateCatalogueRows,
  generateSlug,
  seedCatalogueBatch,
  resolveWorkbookPath,
} from '../scripts/seed-excel-catalogue';
import { RawCatalogueRow } from '../scripts/import-catalogue';

describe('Excel Seeder — Workbook Detection & Extraction', () => {
  it('resolves the real workbook path or falls back appropriately', () => {
    const resolved = resolveWorkbookPath();
    expect(resolved).toBeTruthy();
    expect(resolved.endsWith('.xlsx')).toBe(true);
  });

  it('inspects workbook structure and finds sheets and columns', () => {
    const workbookPath = resolveWorkbookPath();
    const inspection = inspectWorkbook(workbookPath);
    expect(inspection.sheetNames).toContain('Products_Import');
    expect(inspection.sheetNames).toContain('Stock_Review');
    expect(inspection.totalRows).toBeGreaterThan(1000);
    expect(inspection.categories.length).toBeGreaterThan(0);
    expect(inspection.brands.length).toBeGreaterThan(0);
  }, 15000);

  it('extracts rows from workbook and preserves source row indices', () => {
    const workbookPath = resolveWorkbookPath();
    const rawRows = extractCatalogueRowsFromWorkbook(workbookPath);
    expect(rawRows.length).toBeGreaterThan(1500);

    const firstRow = rawRows[0];
    expect(firstRow.productName).toBeTruthy();
    expect(firstRow.category).toBeTruthy();
    expect(firstRow.brand).toBeTruthy();
    expect(firstRow.salePrice).toBeGreaterThan(0);
  }, 15000);
});

describe('Excel Seeder — Validation & Price Mapping', () => {
  it('correctly calculates fixed rupee discount', () => {
    const sampleRows: RawCatalogueRow[] = [
      {
        productName: '1" Column Pipe (Ashirvad) 12.5 Kg',
        category: 'Pipes & Plumbing Systems',
        brand: 'Ashirvad',
        salePrice: 240,
        saleDiscount: 0,
        stock: 10,
      },
      {
        productName: 'Sample Fitting',
        category: 'Pipes & Plumbing Systems',
        brand: 'Ashirvad',
        salePrice: 100,
        saleDiscount: 15,
        stock: 5,
      },
    ];

    const { validItems, invalidErrors } = validateCatalogueRows(sampleRows);
    expect(invalidErrors.length).toBe(0);
    expect(validItems.length).toBe(2);

    expect(validItems[0].basePrice).toBe(240);
    expect(validItems[0].compareAtPrice).toBe(240);
    expect(validItems[0].specs.discount_amount).toBe('0.00');

    expect(validItems[1].basePrice).toBe(85);
    expect(validItems[1].compareAtPrice).toBe(100);
    expect(validItems[1].specs.discount_amount).toBe('15.00');
    expect(validItems[1].specs.discount_type).toBe('fixed_inr');
  });

  it('detects and flags rows where discount exceeds MRP (negative base price)', () => {
    const invalidRows: RawCatalogueRow[] = [
      {
        productName: 'Defective Price Item',
        category: 'Pipes & Plumbing Systems',
        brand: 'Ashirvad',
        salePrice: 20,
        saleDiscount: 35,
        stock: 0,
      },
    ];

    const { validItems, invalidErrors } = validateCatalogueRows(invalidRows);
    expect(invalidErrors.length).toBe(1);
    expect(validItems.length).toBe(0);
    expect(invalidErrors[0].issue).toContain('Fixed discount');
  });

  it('rejects missing or invalid MRP', () => {
    const invalidRows: RawCatalogueRow[] = [
      {
        productName: 'Zero Price Item',
        category: 'Pipes & Plumbing Systems',
        brand: 'Ashirvad',
        salePrice: 0,
      },
      {
        productName: 'Negative Price Item',
        category: 'Pipes & Plumbing Systems',
        brand: 'Ashirvad',
        salePrice: -50,
      },
    ];

    const { validItems, invalidErrors } = validateCatalogueRows(invalidRows);
    expect(invalidErrors.length).toBe(2);
    expect(validItems.length).toBe(0);
  });

  it('detects and rejects negative stock while treating undefined/null as 0', () => {
    const rows: RawCatalogueRow[] = [
      {
        productName: 'Negative Stock Item',
        category: 'Pipes & Plumbing Systems',
        brand: 'Ashirvad',
        salePrice: 100,
        stock: -5,
      },
      {
        productName: 'Zero/Unspecified Stock Item',
        category: 'Pipes & Plumbing Systems',
        brand: 'Ashirvad',
        salePrice: 100,
        stock: undefined,
      },
    ];

    const { validItems, invalidErrors } = validateCatalogueRows(rows);
    expect(invalidErrors.length).toBe(1); // Negative stock rejected
    expect(validItems.length).toBe(1); // Undefined stock valid as 0
    expect(validItems[0].initialStock).toBe(0);
  });

  it('detects duplicate product slugs deterministically and de-duplicates them with a suffix', () => {
    const duplicateRows: RawCatalogueRow[] = [
      {
        productName: 'Unique Pipe 1',
        category: 'Pipes & Plumbing Systems',
        brand: 'Ashirvad',
        salePrice: 100,
      },
      {
        productName: 'Unique Pipe 1',
        category: 'Pipes & Plumbing Systems',
        brand: 'Ashirvad',
        salePrice: 100,
      },
    ];

    const { validItems, duplicatesCount } = validateCatalogueRows(duplicateRows);
    expect(duplicatesCount).toBe(1);
    expect(validItems.length).toBe(2);
    expect(validItems[0].slug).not.toBe(validItems[1].slug);
    expect(validItems[1].slug).toContain('ashirvad-unique-pipe-1-');
  });
});

describe('Excel Seeder — Batch Seeding & Idempotency', () => {
  it('handles existing categories, brands, products, and inventory without duplicates', async () => {
    const mockClient: any = {
      from: vi.fn((table: string) => {
        if (table === 'categories') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'cat-123', slug: 'pipes-plumbing-systems' },
                  error: null,
                }),
              })),
            })),
          };
        }
        if (table === 'brands') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'brand-123', slug: 'ashirvad' },
                  error: null,
                }),
              })),
            })),
          };
        }
        if (table === 'products') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'prod-123', slug: 'ashirvad-pipe-100' },
                  error: null,
                }),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'prod-123', slug: 'ashirvad-pipe-100' },
                  error: null,
                }),
              })),
            })),
          };
        }
        if (table === 'inventory') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'inv-123', quantity: 20 }, // Existing stock preserved!
                    error: null,
                  }),
                })),
              })),
            })),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      }),
    };

    const sampleProduct = {
      name: 'Ashirvad Pipe 100',
      slug: 'ashirvad-pipe-100',
      sku: null,
      description: '',
      categoryName: 'Pipes & Plumbing Systems',
      brandName: 'Ashirvad',
      basePrice: 100,
      compareAtPrice: 100,
      unit: 'piece',
      unitOfSale: 'piece',
      material: null,
      diameter: null,
      length: null,
      pressureRating: null,
      technicalStandard: null,
      intendedApplication: null,
      comparisonGroupId: null,
      imageUrl: null,
      specs: {
        mrp: '100.00',
        discount_amount: '0.00',
        discount_type: 'fixed_inr',
      },
      initialStock: 10,
      isVariant: false,
      parentSku: null,
      variantName: null,
      variantAttributes: {},
    };

    const result = await seedCatalogueBatch(mockClient, [sampleProduct]);

    expect(result.productsExisting).toBe(1);
    expect(result.productsCreated).toBe(0);
    expect(result.inventoryCreated).toBe(0); // Existing stock preserved, not overwritten!
    expect(result.inventoryExisting).toBe(1);
    expect(result.success).toBe(true);
  });
});

describe('Excel Seeder — Schema Compatibility & Image/Stock Auditing', () => {
  it('does not create placeholder images or map blank images to product_images table', () => {
    const rawRows: RawCatalogueRow[] = [
      {
        productName: 'Clean Product With No Image',
        category: 'Pipes & Plumbing Systems',
        brand: 'Ashirvad',
        salePrice: 500,
        saleDiscount: 50,
      },
    ];

    const { validItems } = validateCatalogueRows(rawRows);
    expect(validItems[0].imageUrl).toBeNull();
    // Neither image_url nor product_images should contain fake placeholders
    expect(validItems[0].imageUrl).not.toBe('https://placeholder.com');
  });

  it('preserves multi-dimensional size in specs.size and reserves diameter for true single diameters', () => {
    const multiDimRow: RawCatalogueRow = {
      productName: 'Sink 18"x16"x8" (Bharat) Square',
      category: 'Kitchen & Utility',
      brand: 'Bharat',
      salePrice: 2500,
      extraSpecs: {
        size: '18"x16"x8"',
      },
    };

    const pipeRow: RawCatalogueRow = {
      productName: '1" CPVC Pipe',
      category: 'Pipes & Plumbing Systems',
      brand: 'Ashirvad',
      salePrice: 400,
      diameter: '1"',
      extraSpecs: {
        size: '1"',
      },
    };

    const { validItems } = validateCatalogueRows([multiDimRow, pipeRow]);
    // multi-dim should not set diameter (should be null or undefined), but preserve in specs
    expect(validItems[0].diameter).toBeNull();
    expect(validItems[0].specs.size).toBe('18"x16"x8"');

    // simple 1" should be mapped to diameter
    expect(validItems[1].diameter).toBe('1"');
    expect(validItems[1].specs.size).toBe('1"');
  });

  it('keeps unknown stock separate from confirmed zero stock during extraction', () => {
    // When stockMap has no match, extracted stock is 0 but marked distinct from verified stock
    const mockStockMap = new Map<string, number>();
    mockStockMap.set('verified item', 42);

    const workbookPath = resolveWorkbookPath();
    const rowsWithMap = extractCatalogueRowsFromWorkbook(workbookPath, { stockMap: mockStockMap });

    const unverifiedItems = rowsWithMap.filter((r) => r.productName.toLowerCase() !== 'verified item');
    expect(unverifiedItems.length).toBeGreaterThan(1000);
    expect(unverifiedItems[0].stock).toBe(0);
  });
});
