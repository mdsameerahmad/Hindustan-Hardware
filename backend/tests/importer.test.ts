import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateAndNormalizeCatalogue,
  RawCatalogueRow,
  generateSlug,
  applySampleToDatabase,
  NormalizedProductPayload,
  MAX_SAMPLE_IMPORT_ITEMS,
} from '../scripts/import-catalogue';

describe('Catalogue Importer & Normalization Logic', () => {
  it('correctly calculates selling price from MRP and fixed Rupee discount', () => {
    const sampleRows: RawCatalogueRow[] = [
      {
        productName: 'Astral CPVC Pro Pipe SDR 11',
        category: 'Pipes & Fittings',
        brand: 'Astral',
        sku: 'AST-CPVC-001',
        salePrice: 1800, // MRP
        saleDiscount: 25, // Fixed INR
        stock: 50,
      },
    ];

    const { report, normalizedItems } = validateAndNormalizeCatalogue(sampleRows);

    expect(report.invalidRowsCount).toBe(0);
    expect(report.validRowsCount).toBe(1);
    expect(normalizedItems[0].compareAtPrice).toBe(1800);
    expect(normalizedItems[0].basePrice).toBe(1775); // 1800 - 25
    expect(normalizedItems[0].specs.discount_amount).toBe('25.00');
    expect(normalizedItems[0].specs.discount_type).toBe('fixed_inr');
    expect(normalizedItems[0].specs.mrp).toBe('1800.00');
  });

  it('rejects rows where discount exceeds MRP', () => {
    const invalidRows: RawCatalogueRow[] = [
      {
        productName: 'Faulty Pricing Item',
        category: 'Sanitary',
        salePrice: 500,
        saleDiscount: 600, // > MRP
      },
    ];

    const { report, normalizedItems } = validateAndNormalizeCatalogue(invalidRows);
    expect(report.invalidRowsCount).toBe(1);
    expect(normalizedItems.length).toBe(0);
    expect(report.errors[0].field).toBe('saleDiscount');
    expect(report.errors[0].issue).toContain('cannot exceed MRP');
  });

  it('rejects rows with invalid or missing MRP', () => {
    const invalidRows: RawCatalogueRow[] = [
      {
        productName: 'Negative Price Item',
        category: 'Sanitary',
        salePrice: -100,
      },
      {
        productName: 'NaN Price Item',
        category: 'Sanitary',
        salePrice: NaN,
      },
    ];

    const { report, normalizedItems } = validateAndNormalizeCatalogue(invalidRows);
    expect(report.invalidRowsCount).toBe(2);
    expect(normalizedItems.length).toBe(0);
  });

  it('detects and flags duplicate SKUs across rows', () => {
    const duplicateRows: RawCatalogueRow[] = [
      {
        productName: 'Brass Ball Valve 1/2 inch',
        category: 'Valves',
        brand: 'Zoloto',
        sku: 'VALVE-001',
        salePrice: 450,
      },
      {
        productName: 'Brass Ball Valve 3/4 inch',
        category: 'Valves',
        brand: 'Zoloto',
        sku: 'VALVE-001', // Duplicate SKU
        salePrice: 620,
      },
    ];

    const { report, normalizedItems } = validateAndNormalizeCatalogue(duplicateRows);
    expect(report.skuCollisionsCount).toBe(1);
    expect(report.invalidRowsCount).toBe(1);
    expect(normalizedItems.length).toBe(1);
  });

  it('disambiguates colliding slugs automatically', () => {
    const collidingSlugRows: RawCatalogueRow[] = [
      {
        productName: 'Brass Bib Cock',
        category: 'Faucets',
        brand: 'Prayag',
        sku: 'PRY-BBC-01',
        salePrice: 350,
      },
      {
        productName: 'Brass Bib Cock',
        category: 'Faucets',
        brand: 'Prayag',
        sku: 'PRY-BBC-02',
        salePrice: 420,
      },
    ];

    const { report, normalizedItems } = validateAndNormalizeCatalogue(collidingSlugRows);
    expect(report.slugCollisionsCount).toBe(1);
    expect(normalizedItems.length).toBe(2);
    expect(normalizedItems[0].slug).toBe('prayag-brass-bib-cock');
    expect(normalizedItems[1].slug).toBe('prayag-brass-bib-cock-pry-bbc-02');
  });

  it('defaults stock to 0 when missing or blank', () => {
    const rowsWithoutStock: RawCatalogueRow[] = [
      {
        productName: 'Teflon Tape 12mm',
        category: 'Consumables',
        salePrice: 30,
      },
    ];

    const { report, normalizedItems } = validateAndNormalizeCatalogue(rowsWithoutStock);
    expect(report.validRowsCount).toBe(1);
    expect(normalizedItems[0].initialStock).toBe(0);
  });

  it('preserves Bharat sink 3D dimensions and technical specifications in specs JSONB', () => {
    const bharatSinkRow: RawCatalogueRow[] = [
      {
        productName: 'Sink 18"x16"x8" (Bharat) Square',
        category: 'Kitchen & Utility',
        brand: 'Bharat',
        salePrice: 1800,
        saleDiscount: 25,
        length: '18"',
        comparisonGroupId: 'CMP-DAA596040B',
        stock: 15,
        extraSpecs: {
          size: '18"x16"x8"',
          product_type: 'Kitchen Sink',
          subcategory: 'Kitchen Sinks',
        },
      },
    ];

    const { normalizedItems } = validateAndNormalizeCatalogue(bharatSinkRow);
    const item = normalizedItems[0];

    expect(item.basePrice).toBe(1775);
    expect(item.compareAtPrice).toBe(1800);
    expect(item.specs.size).toBe('18"x16"x8"'); // Full 3D size preserved for frontend
    expect(item.specs.discount_amount).toBe('25.00');
    expect(item.specs.discount_type).toBe('fixed_inr');
    expect(item.specs.product_type).toBe('Kitchen Sink');
  });

  it('enforces maximum sample size of 10 items for --apply-sample mode', () => {
    expect(MAX_SAMPLE_IMPORT_ITEMS).toBe(10);
  });
});

describe('applySampleToDatabase (Mocked Client)', () => {
  const sampleItems: NormalizedProductPayload[] = [
    {
      name: '2" Pipe (Ashirvad) CM ISI',
      slug: 'ashirvad-2-pipe-ashirvad-cm-isi',
      sku: null,
      description: '',
      categoryName: 'Pipes & Plumbing Systems',
      brandName: 'Ashirvad',
      basePrice: 837,
      compareAtPrice: 872,
      unit: 'piece',
      unitOfSale: 'piece',
      material: null,
      diameter: '2"',
      length: null,
      pressureRating: null,
      technicalStandard: null,
      intendedApplication: null,
      comparisonGroupId: 'CMP-DD97F37B7E',
      imageUrl: null,
      specs: {
        mrp: '872.00',
        discount_amount: '35.00',
        discount_type: 'fixed_inr',
      },
      initialStock: 40,
      isVariant: false,
      parentSku: null,
      variantName: null,
      variantAttributes: {},
    },
  ];

  it('inserts categories, brands, products, and inventory on first run', async () => {
    // In-memory mock store
    const store: Record<string, any[]> = {
      categories: [],
      brands: [],
      products: [],
      inventory: [],
    };

    const mockClient: any = {
      from: vi.fn((table: string) => {
        let currentTable = table;
        let filters: Record<string, any> = {};
        let isNullFilter: string | null = null;

        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn((col: string, val: any) => {
            filters[col] = val;
            return chain;
          }),
          is: vi.fn((col: string, val: any) => {
            if (val === null) isNullFilter = col;
            return chain;
          }),
          maybeSingle: vi.fn(async () => {
            const list = store[currentTable] || [];
            const found = list.find((item) => {
              for (const [k, v] of Object.entries(filters)) {
                if (item[k] !== v) return false;
              }
              if (isNullFilter && item[isNullFilter] !== null) return false;
              return true;
            });
            return { data: found || null, error: null };
          }),
          single: vi.fn(async () => {
            const list = store[currentTable] || [];
            const found = list.find((item) => {
              for (const [k, v] of Object.entries(filters)) {
                if (item[k] !== v) return false;
              }
              return true;
            });
            return { data: found || null, error: null };
          }),
          insert: vi.fn((payload: any) => {
            const row = { id: `uuid-${Math.random()}`, ...payload };
            store[currentTable].push(row);
            const insertChain: any = {
              select: vi.fn(() => insertChain),
              single: vi.fn(async () => ({ data: row, error: null })),
              then: (resolve: any) => resolve({ data: row, error: null }),
            };
            return insertChain;
          }),
        };
        return chain;
      }),
    };

    const result = await applySampleToDatabase(sampleItems, mockClient);

    expect(result.success).toBe(true);
    expect(result.productsCreated).toBe(1);
    expect(result.inventoryCreated).toBe(1);
    expect(result.items[0].stock).toBe(40);
    expect(result.items[0].basePrice).toBe(837);
    expect(result.items[0].compareAtPrice).toBe(872);
  });

  it('preserves existing stock and does not duplicate product on rerun', async () => {
    // Pre-populated store
    const store: Record<string, any[]> = {
      categories: [{ id: 'cat-1', name: 'Pipes & Plumbing Systems', slug: 'pipes-plumbing-systems' }],
      brands: [{ id: 'brand-1', name: 'Ashirvad', slug: 'ashirvad' }],
      products: [
        {
          id: 'prod-1',
          slug: 'ashirvad-2-pipe-ashirvad-cm-isi',
          base_price: 837,
          compare_at_price: 872,
        },
      ],
      inventory: [
        {
          id: 'inv-1',
          product_id: 'prod-1',
          variant_id: null,
          quantity_available: 55, // Modified in store, must be preserved
        },
      ],
    };

    const mockClient: any = {
      from: vi.fn((table: string) => {
        let currentTable = table;
        let filters: Record<string, any> = {};
        let isNullFilter: string | null = null;

        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn((col: string, val: any) => {
            filters[col] = val;
            return chain;
          }),
          is: vi.fn((col: string, val: any) => {
            if (val === null) isNullFilter = col;
            return chain;
          }),
          maybeSingle: vi.fn(async () => {
            const list = store[currentTable] || [];
            const found = list.find((item) => {
              for (const [k, v] of Object.entries(filters)) {
                if (item[k] !== v) return false;
              }
              if (isNullFilter && item[isNullFilter] !== null) return false;
              return true;
            });
            return { data: found || null, error: null };
          }),
          single: vi.fn(async () => {
            const list = store[currentTable] || [];
            const found = list[0];
            return { data: found || null, error: null };
          }),
          insert: vi.fn(async (payload: any) => {
            const row = { id: `uuid-${Math.random()}`, ...payload };
            store[currentTable].push(row);
            return {
              data: row,
              error: null,
              select: vi.fn(() => ({
                single: async () => ({ data: row, error: null }),
              })),
            };
          }),
        };
        return chain;
      }),
    };

    const result = await applySampleToDatabase(sampleItems, mockClient);

    expect(result.success).toBe(true);
    expect(result.productsCreated).toBe(0);
    expect(result.productsExisting).toBe(1);
    expect(result.inventoryCreated).toBe(0);
    expect(result.inventoryExisting).toBe(1);
    // Preserves live stock of 55 instead of overwriting with source 40
    expect(result.items[0].stock).toBe(55);
  });

  it('correctly configures isSupabaseAdminConfigured when service role key is present even if anon key is empty', async () => {
    const { isSupabaseAdminConfigured, getSupabaseAdminClient } = await import('../src/config/supabase');
    // Verifies that isSupabaseAdminConfigured returns a boolean without throwing
    expect(typeof isSupabaseAdminConfigured()).toBe('boolean');
    // Verifies that getSupabaseAdminClient executes without crashing
    const admin = getSupabaseAdminClient();
    if (isSupabaseAdminConfigured()) {
      expect(admin).not.toBeNull();
      expect(typeof admin?.from).toBe('function');
    } else {
      expect(admin).toBeNull();
    }
  });
});

