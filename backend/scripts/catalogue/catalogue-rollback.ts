import { PoolClient } from 'pg';

export interface RollbackCompensationItem {
  productId: string;
  sku: string;
  name: string;
  initialOpeningStock: number;
  remainingAttributableOpeningStock: number;
  currentQuantityAvailable: number;
  currentQuantityReserved: number;
  subsequentRestocksPreserved: number;
  compensatingDeduction: number;
  quantityAfter: number;
  productDeactivated: boolean;
  status:
    | 'compensated'
    | 'skipped_not_owned'
    | 'skipped_shared_active_reference'
    | 'skipped_zero_attributable'
    | 'skipped_already_compensated'
    | 'failed_ledger_inconsistent'
    | 'failed_missing_opening_movement'
    | 'failed_ambiguous_ownership';
  reason: string;
}

export interface RollbackSummary {
  batchId: string;
  actor: string;
  reason: string;
  totalProductsDeactivated: number;
  totalMovementsCreated: number;
  items: RollbackCompensationItem[];
  failedProducts: Array<{
    productId: string;
    sku: string;
    error: string;
  }>;
}

export interface ExecuteRollbackOptions {
  batchId: string;
  actor: string;
  reason: string;
  adminDecisionConfirmed: boolean;
  schemaName?: string;
}

export interface LedgerMovementRecord {
  id: string;
  product_id: string;
  movement_type: string;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference_id: string | null;
  created_at: Date;
}

/**
 * Reconciles the inventory movement ledger chronologically for a product.
 * Traces the remaining balance attributable strictly to the initial opening movement,
 * distinguishing it from subsequent legitimate restocks and adjustments.
 */
export function reconcileLedgerForOpeningStock(
  movements: LedgerMovementRecord[],
  openingRef: string
): {
  isValid: boolean;
  errorMessage?: string;
  openingMovement?: LedgerMovementRecord;
  initialOpeningQty: number;
  remainingOpeningQty: number;
  subsequentAdditionsTotal: number;
} {
  if (movements.length === 0) {
    return {
      isValid: false,
      errorMessage: `Missing original opening movement with reference: ${openingRef} (Movement history is empty).`,
      initialOpeningQty: 0,
      remainingOpeningQty: 0,
      subsequentAdditionsTotal: 0,
    };
  }

  // Find the original opening movement
  const openingIdx = movements.findIndex((m) => m.reference_id === openingRef);
  if (openingIdx === -1) {
    return {
      isValid: false,
      errorMessage: `Missing original opening movement with reference: ${openingRef}`,
      initialOpeningQty: 0,
      remainingOpeningQty: 0,
      subsequentAdditionsTotal: 0,
    };
  }

  const openingMov = movements[openingIdx];
  if (openingMov.movement_type !== 'restock' || openingMov.quantity_change <= 0) {
    return {
      isValid: false,
      errorMessage: `Invalid opening movement semantics: type=${openingMov.movement_type}, change=${openingMov.quantity_change}`,
      initialOpeningQty: 0,
      remainingOpeningQty: 0,
      subsequentAdditionsTotal: 0,
    };
  }

  // 1. Verify chronological chain integrity (quantity_before & quantity_after consistency)
  for (let i = 0; i < movements.length; i++) {
    const mov = movements[i];
    if (mov.quantity_before + mov.quantity_change !== mov.quantity_after) {
      return {
        isValid: false,
        errorMessage: `Ledger arithmetic mismatch at movement ${mov.id || i}: before(${mov.quantity_before}) + change(${mov.quantity_change}) != after(${mov.quantity_after})`,
        initialOpeningQty: 0,
        remainingOpeningQty: 0,
        subsequentAdditionsTotal: 0,
      };
    }
    if (i > 0) {
      const prev = movements[i - 1];
      if (prev.quantity_after !== mov.quantity_before) {
        return {
          isValid: false,
          errorMessage: `Ledger continuity break at movement ${mov.id || i}: previous after(${prev.quantity_after}) != current before(${mov.quantity_before})`,
          initialOpeningQty: 0,
          remainingOpeningQty: 0,
          subsequentAdditionsTotal: 0,
        };
      }
    }
  }

  // 2. Ledger attribution algorithm:
  // Track remaining original opening stock versus subsequent separate stock additions.
  // When an order deduction, return, or manual adjustment occurs:
  // - Deductions consume opening stock first (FIFO standard stock attribution).
  // - Subsequent additions (restock, PO shipments, correction +) are tracked as independent inventory layers.
  let remainingOpening = openingMov.quantity_change;
  let subsequentAdditions = 0;

  for (let i = openingIdx + 1; i < movements.length; i++) {
    const mov = movements[i];

    // If a previous rollback compensation was already recorded, skip it in standard layer tracing
    if (mov.reference_id && mov.reference_id.startsWith('ROLLBACK-COMP-')) {
      continue;
    }

    if (mov.quantity_change > 0) {
      // Subsequent restock, positive correction, order cancellation/return restock
      subsequentAdditions += mov.quantity_change;
    } else if (mov.quantity_change < 0) {
      const deductionAbs = Math.abs(mov.quantity_change);

      // Consume from opening stock first, then subsequent additions
      if (remainingOpening >= deductionAbs) {
        remainingOpening -= deductionAbs;
      } else {
        const excess = deductionAbs - remainingOpening;
        remainingOpening = 0;
        subsequentAdditions = Math.max(0, subsequentAdditions - excess);
      }
    }
  }

  return {
    isValid: true,
    openingMovement: openingMov,
    initialOpeningQty: openingMov.quantity_change,
    remainingOpeningQty: remainingOpening,
    subsequentAdditionsTotal: subsequentAdditions,
  };
}

/**
 * Executes a batch-aware, ledger-reconciled post-commit rollback for an imported batch:
 * 1. Requires explicit administrator decision confirmation.
 * 2. Checks batch ownership:
 *    - Only deactivates products that were CREATED by this batch AND are not referenced by another active batch.
 *    - Only compensates opening movements that were CREATED by this batch.
 * 3. Inspects current live inventory state with SELECT FOR UPDATE.
 * 4. Reconciles the inventory movement ledger chronologically to isolate remaining opening stock.
 * 5. Strictly preserves subsequent legitimate restocks and adjustments.
 * 6. Preserves quantity_reserved and never deducts stock below reserved quantity.
 * 7. If ownership or ledger is ambiguous/inconsistent, stops and reports the product without modifying inventory.
 * 8. Records audited compensating movements with reference ROLLBACK-COMP-BATCH-{batch_id}-SKU-{sku}.
 * 9. Idempotent across repeated or concurrent attempts.
 */
export async function executeSafeCatalogueRollback(
  client: PoolClient,
  options: ExecuteRollbackOptions
): Promise<RollbackSummary> {
  const { batchId, actor, reason, adminDecisionConfirmed, schemaName = 'public' } = options;

  if (!adminDecisionConfirmed) {
    throw new Error('Rollback aborted: Administrator decision confirmation is strictly required.');
  }

  if (!actor || actor.trim() === '') {
    throw new Error('Rollback aborted: Actor identity is required for audit logging.');
  }

  if (!reason || reason.trim() === '') {
    throw new Error('Rollback aborted: A valid reason must be recorded for audit logging.');
  }

  const summary: RollbackSummary = {
    batchId,
    actor,
    reason,
    totalProductsDeactivated: 0,
    totalMovementsCreated: 0,
    items: [],
    failedProducts: [],
  };

  await client.query('BEGIN;');

  try {
    // 1. Fetch all products mapped in this batch with explicit ownership flags
    const mappingsRes = await client.query(
      `SELECT 
         m.id AS mapping_id,
         m.product_id, 
         m.product_sku, 
         m.source_product_name, 
         m.imported_stock_qty,
         m.product_created_by_this_batch,
         m.opening_movement_created_by_this_batch,
         m.opening_movement_reference
       FROM ${schemaName}.catalogue_import_mappings m
       WHERE m.batch_id = $1`,
      [batchId]
    );

    if (mappingsRes.rows.length === 0) {
      await client.query('COMMIT;');
      return summary;
    }

    // 2. Identify products eligible for deactivation
    // Rule: Product must have been created by this batch AND have no active references in other batches
    for (const row of mappingsRes.rows) {
      const productId = row.product_id;
      const sku = row.product_sku;
      const name = row.source_product_name;

      if (!productId) continue;

      // Lock current inventory row FOR UPDATE
      const invRes = await client.query(
        `SELECT id, quantity_available, quantity_reserved
         FROM ${schemaName}.inventory
         WHERE product_id = $1 AND variant_id IS NULL
         FOR UPDATE;`,
        [productId]
      );

      if (invRes.rows.length === 0) {
        summary.failedProducts.push({
          productId,
          sku,
          error: 'No product-level inventory record found.',
        });
        continue;
      }

      const inv = invRes.rows[0];
      const qtyAvailable = inv.quantity_available;
      const qtyReserved = inv.quantity_reserved;

      // Check for other active batch mappings referencing this same product
      const otherBatchesRes = await client.query(
        `SELECT count(DISTINCT batch_id) AS other_active_count
         FROM ${schemaName}.catalogue_import_mappings
         WHERE product_id = $1 AND batch_id != $2;`,
        [productId, batchId]
      );
      const otherActiveBatchCount = parseInt(otherBatchesRes.rows[0].other_active_count, 10);

      let productDeactivated = false;
      let deactivationReason = '';

      if (!row.product_created_by_this_batch) {
        deactivationReason = 'Product was created by another batch; deactivation skipped.';
      } else if (otherActiveBatchCount > 0) {
        deactivationReason = `Product is still actively referenced by ${otherActiveBatchCount} other batch(es); deactivation skipped.`;
      } else {
        // Safe to deactivate if currently active
        const deactRes = await client.query(
          `UPDATE ${schemaName}.products
           SET is_active = false, updated_at = timezone('utc'::text, now())
           WHERE id = $1 AND is_active = true;`,
          [productId]
        );
        if ((deactRes.rowCount || 0) > 0) {
          summary.totalProductsDeactivated++;
          productDeactivated = true;
        }
      }

      // Check Opening Movement Ownership
      if (!row.opening_movement_created_by_this_batch) {
        // Target batch does not own the opening movement!
        summary.items.push({
          productId,
          sku,
          name,
          initialOpeningStock: row.imported_stock_qty,
          remainingAttributableOpeningStock: 0,
          currentQuantityAvailable: qtyAvailable,
          currentQuantityReserved: qtyReserved,
          subsequentRestocksPreserved: qtyAvailable,
          compensatingDeduction: 0,
          quantityAfter: qtyAvailable,
          productDeactivated,
          status: 'skipped_not_owned',
          reason: `Batch ${batchId} does not own the opening movement for SKU ${sku}. Reversal skipped. ${deactivationReason}`.trim(),
        });
        continue;
      }

      // Idempotency check: Has this batch already compensated this SKU?
      const compRef = `ROLLBACK-COMP-BATCH-${batchId}-SKU-${sku}`;
      const existingCompRes = await client.query(
        `SELECT id, quantity_change FROM ${schemaName}.inventory_movements WHERE reference_id = $1;`,
        [compRef]
      );

      if (existingCompRes.rows.length > 0) {
        summary.items.push({
          productId,
          sku,
          name,
          initialOpeningStock: row.imported_stock_qty,
          remainingAttributableOpeningStock: 0,
          currentQuantityAvailable: qtyAvailable,
          currentQuantityReserved: qtyReserved,
          subsequentRestocksPreserved: 0,
          compensatingDeduction: 0,
          quantityAfter: qtyAvailable,
          productDeactivated,
          status: 'skipped_already_compensated',
          reason: `Compensation movement already recorded under reference ${compRef}. ${deactivationReason}`.trim(),
        });
        continue;
      }

      // If imported stock was 0, no opening movement exists to reverse
      if (row.imported_stock_qty <= 0) {
        summary.items.push({
          productId,
          sku,
          name,
          initialOpeningStock: 0,
          remainingAttributableOpeningStock: 0,
          currentQuantityAvailable: qtyAvailable,
          currentQuantityReserved: qtyReserved,
          subsequentRestocksPreserved: qtyAvailable,
          compensatingDeduction: 0,
          quantityAfter: qtyAvailable,
          productDeactivated,
          status: 'skipped_zero_attributable',
          reason: `Initial import stock was zero; no opening stock movement exists to reverse. ${deactivationReason}`.trim(),
        });
        continue;
      }

      // Fetch all movements for this product in chronological order
      const openingRef = row.opening_movement_reference || `OPENING-STOCK-SKU-${sku}`;
      const movementsRes = await client.query(
        `SELECT id, product_id, movement_type, quantity_change, quantity_before, quantity_after, reason, reference_id, created_at
         FROM ${schemaName}.inventory_movements
         WHERE product_id = $1
         ORDER BY created_at ASC, id ASC;`,
        [productId]
      );

      const movements: LedgerMovementRecord[] = movementsRes.rows;

      // Reconcile ledger
      const reconciliation = reconcileLedgerForOpeningStock(movements, openingRef);

      if (!reconciliation.isValid) {
        // Inconsistent or incomplete ledger: STOP and REPORT without touching inventory
        summary.failedProducts.push({
          productId,
          sku,
          error: reconciliation.errorMessage || 'Ledger reconciliation failed.',
        });
        summary.items.push({
          productId,
          sku,
          name,
          initialOpeningStock: row.imported_stock_qty,
          remainingAttributableOpeningStock: 0,
          currentQuantityAvailable: qtyAvailable,
          currentQuantityReserved: qtyReserved,
          subsequentRestocksPreserved: 0,
          compensatingDeduction: 0,
          quantityAfter: qtyAvailable,
          productDeactivated,
          status: reconciliation.errorMessage?.includes('Missing original')
            ? 'failed_missing_opening_movement'
            : 'failed_ledger_inconsistent',
          reason: `Reconciliation halted: ${reconciliation.errorMessage}`,
        });
        continue;
      }

      const remainingOpening = reconciliation.remainingOpeningQty;

      if (remainingOpening <= 0) {
        summary.items.push({
          productId,
          sku,
          name,
          initialOpeningStock: reconciliation.initialOpeningQty,
          remainingAttributableOpeningStock: 0,
          currentQuantityAvailable: qtyAvailable,
          currentQuantityReserved: qtyReserved,
          subsequentRestocksPreserved: qtyAvailable,
          compensatingDeduction: 0,
          quantityAfter: qtyAvailable,
          productDeactivated,
          status: 'skipped_zero_attributable',
          reason: `Attributable opening stock has already been completely consumed by subsequent operations. ${deactivationReason}`.trim(),
        });
        continue;
      }

      // Calculate safe deduction from remaining attributable opening stock
      const maxSafeDeduction = Math.min(remainingOpening, qtyAvailable);

      if (maxSafeDeduction <= 0) {
        summary.items.push({
          productId,
          sku,
          name,
          initialOpeningStock: reconciliation.initialOpeningQty,
          remainingAttributableOpeningStock: remainingOpening,
          currentQuantityAvailable: qtyAvailable,
          currentQuantityReserved: qtyReserved,
          subsequentRestocksPreserved: qtyAvailable,
          compensatingDeduction: 0,
          quantityAfter: qtyAvailable,
          productDeactivated,
          status: 'skipped_zero_attributable',
          reason: `Current quantity available is 0; no deduction possible without violating reserved stock. ${deactivationReason}`.trim(),
        });
        continue;
      }

      const newAvailable = qtyAvailable - maxSafeDeduction;

      // Update inventory table atomically
      await client.query(
        `UPDATE ${schemaName}.inventory
         SET quantity_available = $1, updated_at = timezone('utc'::text, now())
         WHERE id = $2;`,
        [newAvailable, inv.id]
      );

      // Record compensating movement
      const movementReason = `Ledger rollback compensation by admin (${actor}): ${reason}. Reversing owned opening stock (${maxSafeDeduction}/${reconciliation.initialOpeningQty}). OriginalRef: ${openingRef}`;
      await client.query(
        `INSERT INTO ${schemaName}.inventory_movements (
           product_id, variant_id, movement_type, quantity_change,
           quantity_before, quantity_after, reason, reference_id
         ) VALUES ($1, NULL, 'correction', $2, $3, $4, $5, $6);`,
        [productId, -maxSafeDeduction, qtyAvailable, newAvailable, movementReason, compRef]
      );

      summary.totalMovementsCreated++;
      summary.items.push({
        productId,
        sku,
        name,
        initialOpeningStock: reconciliation.initialOpeningQty,
        remainingAttributableOpeningStock: remainingOpening - maxSafeDeduction,
        currentQuantityAvailable: qtyAvailable,
        currentQuantityReserved: qtyReserved,
        subsequentRestocksPreserved: reconciliation.subsequentAdditionsTotal,
        compensatingDeduction: -maxSafeDeduction,
        quantityAfter: newAvailable,
        productDeactivated,
        status: 'compensated',
        reason: `${movementReason}. ${deactivationReason}`.trim(),
      });
    }

    await client.query('COMMIT;');
    return summary;
  } catch (err) {
    await client.query('ROLLBACK;');
    throw err;
  }
}
