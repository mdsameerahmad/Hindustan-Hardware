import { describe, it, expect, vi } from 'vitest';
import {
  buildRollbackPlan,
  executeRollback,
  PRESERVED_PRODUCT_SLUGS,
  PRESERVED_CATEGORY_SLUGS,
  PRESERVED_BRAND_SLUGS,
} from '../scripts/rollback-full-import';

describe('Rollback Script — Safety & Invariant Tests', () => {
  it('correctly partitions preserved sample products vs imported products to delete', async () => {
    const mockClient: any = {
      from: vi.fn((table: string) => {
        if (table === 'products') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'p1', name: 'Sample 1', slug: 'ashirvad-2-pipe-ashirvad-cm-isi' },
                { id: 'p2', name: 'Sample 2', slug: 'hindware-angle-cock-hindware-addons' },
                { id: 'p3', name: 'Sample 3', slug: 'bharat-sink-18x16x8-bharat-square' },
                { id: 'p4', name: 'Sample 4', slug: 'supreme-075-pipe-supreme-cpvc-11' },
                { id: 'p5', name: 'Sample 5', slug: 'zoloto-05-ball-valve-zoloto' },
                { id: 'p6', name: 'Imported Pipe', slug: 'ashirvad-1-column-pipe' },
                { id: 'p7', name: 'Imported Fitting', slug: 'birla-socket' },
              ],
              error: null,
            }),
          };
        }
        if (table === 'inventory') {
          return {
            select: vi.fn(() => ({
              is: vi.fn().mockResolvedValue({
                data: [
                  { id: 'i1', product_id: 'p1', quantity_available: 40 },
                  { id: 'i2', product_id: 'p2', quantity_available: 25 },
                  { id: 'i3', product_id: 'p3', quantity_available: 15 },
                  { id: 'i4', product_id: 'p4', quantity_available: 60 },
                  { id: 'i5', product_id: 'p5', quantity_available: 30 },
                  { id: 'i6', product_id: 'p6', quantity_available: 0 },
                  { id: 'i7', product_id: 'p7', quantity_available: 0 },
                ],
                error: null,
              }),
            })),
          };
        }
        if (table === 'categories') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'c1', name: 'Pipes & Plumbing Systems', slug: 'pipes-plumbing-systems' },
                { id: 'c2', name: 'Bathroom & Plumbing Fittings', slug: 'bathroom-plumbing-fittings' },
                { id: 'c3', name: 'Kitchen & Utility', slug: 'kitchen-utility' },
                { id: 'c4', name: 'Water Storage', slug: 'water-storage' },
              ],
              error: null,
            }),
          };
        }
        if (table === 'brands') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'b1', name: 'Ashirvad', slug: 'ashirvad' },
                { id: 'b2', name: 'Hindware', slug: 'hindware' },
                { id: 'b3', name: 'Bharat', slug: 'bharat' },
                { id: 'b4', name: 'Supreme', slug: 'supreme' },
                { id: 'b5', name: 'Zoloto', slug: 'zoloto' },
                { id: 'b6', name: 'Aster', slug: 'aster' },
              ],
              error: null,
            }),
          };
        }
        if (['order_items', 'cart_items', 'wishlists', 'product_images'].includes(table)) {
          return {
            select: vi.fn().mockResolvedValue({ count: 0, error: null }),
          };
        }
        return {};
      }),
    };

    const plan = await buildRollbackPlan(mockClient);

    expect(plan.preservedProducts.length).toBe(5);
    expect(plan.preservedInventory.length).toBe(5);
    expect(plan.preservedCategories.length).toBe(3);
    expect(plan.preservedBrands.length).toBe(5);

    expect(plan.productsToDelete.length).toBe(2);
    expect(plan.inventoryToDeleteCount).toBe(2);
    expect(plan.categoriesToDelete.length).toBe(1);
    expect(plan.brandsToDelete.length).toBe(1);

    expect(plan.expectedCountsAfterRollback.products).toBe(5);
    expect(plan.expectedCountsAfterRollback.inventory).toBe(5);
    expect(plan.expectedCountsAfterRollback.categories).toBe(3);
    expect(plan.expectedCountsAfterRollback.brands).toBe(5);
  });

  it('aborts rollback execution if active orders are detected on target products', async () => {
    const mockClient: any = {};
    const mockPlan: any = {
      blockingReferences: {
        ordersFound: 2,
        cartItemsFound: 0,
      },
      productsToDelete: [{ id: 'p-123' }],
    };

    await expect(executeRollback(mockClient, mockPlan)).rejects.toThrow(
      /Rollback aborted: Found active dependencies/
    );
  });

  it('safely deletes in batches without mutating preserved records', async () => {
    const deleteCalls: string[] = [];

    const mockClient: any = {
      from: vi.fn((table: string) => {
        return {
          delete: vi.fn(() => {
            deleteCalls.push(table);
            return {
              in: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({ count: 2, error: null }),
                then: (resolve: any) => resolve({ count: 2, error: null }),
              })),
            };
          }),
        };
      }),
    };

    const mockPlan: any = {
      blockingReferences: {
        ordersFound: 0,
        cartItemsFound: 0,
      },
      productsToDelete: [{ id: 'p6' }, { id: 'p7' }],
      categoriesToDelete: [{ id: 'c4' }],
      brandsToDelete: [{ id: 'b6' }],
    };

    const result = await executeRollback(mockClient, mockPlan);
    expect(result.success).toBe(true);
    expect(deleteCalls).toContain('inventory');
    expect(deleteCalls).toContain('products');
    expect(deleteCalls).toContain('categories');
    expect(deleteCalls).toContain('brands');
  });
});
