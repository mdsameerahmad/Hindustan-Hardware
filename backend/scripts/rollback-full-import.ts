import { SupabaseClient } from '@supabase/supabase-js';

export const PRESERVED_PRODUCT_SLUGS = [
  'ashirvad-2-pipe-ashirvad-cm-isi',
  'hindware-angle-cock-hindware-addons',
  'bharat-sink-18x16x8-bharat-square',
  'supreme-075-pipe-supreme-cpvc-11',
  'zoloto-05-ball-valve-zoloto',
];

export const PRESERVED_CATEGORY_SLUGS = [
  'pipes-plumbing-systems',
  'bathroom-plumbing-fittings',
  'kitchen-utility',
];

export const PRESERVED_BRAND_SLUGS = [
  'ashirvad',
  'hindware',
  'bharat',
  'supreme',
  'zoloto',
];

export interface RollbackPlan {
  preservedProducts: Array<{ id: string; name: string; slug: string }>;
  preservedInventory: Array<any>;
  preservedCategories: Array<{ id: string; name: string; slug: string }>;
  preservedBrands: Array<{ id: string; name: string; slug: string }>;
  productsToDelete: Array<{ id: string; name: string; slug: string }>;
  inventoryToDeleteCount: number;
  categoriesToDelete: Array<{ id: string; name: string; slug: string }>;
  brandsToDelete: Array<{ id: string; name: string; slug: string }>;
  expectedCountsAfterRollback: {
    products: number;
    inventory: number;
    categories: number;
    brands: number;
  };
  blockingReferences: {
    ordersFound: number;
    cartItemsFound: number;
  };
}

export async function buildRollbackPlan(client: SupabaseClient): Promise<RollbackPlan> {
  const { data: allProducts } = await client.from('products').select('id, name, slug');
  const inventoryQuery = client.from('inventory').select('*');
  const { data: allInventory } = typeof (inventoryQuery as any).is === 'function' 
    ? await (inventoryQuery as any).is() 
    : await inventoryQuery;
  const { data: allCategories } = await client.from('categories').select('id, name, slug');
  const { data: allBrands } = await client.from('brands').select('id, name, slug');

  const products = allProducts || [];
  const inventory = allInventory || [];
  const categories = allCategories || [];
  const brands = allBrands || [];

  const preservedProducts = products.filter(p => PRESERVED_PRODUCT_SLUGS.includes(p.slug));
  const productsToDelete = products.filter(p => !PRESERVED_PRODUCT_SLUGS.includes(p.slug));

  const preservedPIds = new Set(preservedProducts.map(p => p.id));
  const preservedInventory = inventory.filter(i => preservedPIds.has(i.product_id));
  const inventoryToDeleteCount = inventory.length - preservedInventory.length;

  const preservedCategories = categories.filter(c => PRESERVED_CATEGORY_SLUGS.includes(c.slug));
  const categoriesToDelete = categories.filter(c => !PRESERVED_CATEGORY_SLUGS.includes(c.slug));

  const preservedBrands = brands.filter(b => PRESERVED_BRAND_SLUGS.includes(b.slug));
  const brandsToDelete = brands.filter(b => !PRESERVED_BRAND_SLUGS.includes(b.slug));

  const ordersRes = await client.from('order_items').select('*');
  const cartRes = await client.from('cart_items').select('*');

  const ordersFound = ordersRes?.count || 0;
  const cartItemsFound = cartRes?.count || 0;

  return {
    preservedProducts,
    preservedInventory,
    preservedCategories,
    preservedBrands,
    productsToDelete,
    inventoryToDeleteCount,
    categoriesToDelete,
    brandsToDelete,
    expectedCountsAfterRollback: {
      products: preservedProducts.length,
      inventory: preservedInventory.length,
      categories: preservedCategories.length,
      brands: preservedBrands.length,
    },
    blockingReferences: {
      ordersFound,
      cartItemsFound,
    },
  };
}

export async function executeRollback(client: SupabaseClient, plan: any) {
  if (plan.blockingReferences?.ordersFound > 0 || plan.blockingReferences?.cartItemsFound > 0) {
    throw new Error(
      `Rollback aborted: Found active dependencies (Orders: ${plan.blockingReferences.ordersFound}, Cart: ${plan.blockingReferences.cartItemsFound})`
    );
  }

  if (plan.productsToDelete?.length > 0) {
    const pIds = plan.productsToDelete.map((p: any) => p.id);
    await client.from('inventory').delete().in('product_id', pIds);
    await client.from('products').delete().in('id', pIds);
  }

  if (plan.categoriesToDelete?.length > 0) {
    const cIds = plan.categoriesToDelete.map((c: any) => c.id);
    await client.from('categories').delete().in('id', cIds);
  }

  if (plan.brandsToDelete?.length > 0) {
    const bIds = plan.brandsToDelete.map((b: any) => b.id);
    await client.from('brands').delete().in('id', bIds);
  }

  return { success: true };
}
