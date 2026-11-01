export interface RawSourceProduct {
  sourceRowNumber: number;
  productName: string;
  brandName: string;
  categoryName: string;
  mrp: number;
  discountPercent: number;
  sellingPrice: number;
  stockQty: number; // Raw float from Excel/CSV
}

export interface ComparisonGroupItem {
  productName: string;
  brandName: string;
  size?: string;
  type?: string;
  material?: string;
  mrp: number;
  sellingPrice: number;
  stockQty: number;
}

export interface ComparisonGroup {
  groupName: string;
  rawHeader: string;
  items: ComparisonGroupItem[];
}

export interface NormalizedBrand {
  name: string;
  slug: string;
  code: string;
  sourceCount: number;
}

export interface NormalizedCategory {
  name: string;
  slug: string;
  sourceCount: number;
}

export interface ValidatedProduct {
  sourceRowNumber: number;
  sourceFingerprint: string;
  persistentIdentityKey: string;
  disambiguationIndex: number;
  name: string;
  brandName: string | null;
  brandSlug: string | null;
  brandCode: string;
  categoryName: string;
  categorySlug: string;
  mrp: number;
  discountPercent: number;
  sellingPrice: number;
  sourceStockRaw: number;
  inventoryStockQty: number;
  isZeroStock: boolean;
  isNegativeStock: boolean;
  isFractionalStock: boolean;
  slug: string;
  sku: string;
  specs: Record<string, any>;
  comparisonGroupId: string | null;
  comparisonGroupName: string | null;
  validationWarnings: string[];
  validationErrors: string[];
}

export interface SourceDiscrepancy {
  rowNumber: number;
  field: string;
  csvValue: any;
  excelValue: any;
  severity: 'warning' | 'error';
  note: string;
}

export interface ValidationReportData {
  timestamp: string;
  batchId: string;
  summary: {
    totalSourceRows: number;
    validProductRows: number;
    invalidProductRows: number;
    distinctBrandsCount: number;
    unbrandedProductsCount: number;
    distinctCategoriesCount: number;
    zeroStockCount: number;
    negativeStockCount: number;
    fractionalStockCount: number;
    positiveStockCount: number;
    comparisonGroupsCount: number;
    comparisonMappedProductsCount: number;
    unverifiedComparisonCount: number;
    slugCollisionsDetected: number;
    skuCollisionsDetected: number;
    priceInconsistenciesCount: number;
  };
  discrepanciesCount: number;
  warningsCount: number;
  errorsCount: number;
}

export interface DryRunPlanSummary {
  mode: 'dry-run';
  timestamp: string;
  batchId: string;
  plannedOperations: {
    brandsToInsert: number;
    brandsToUpdate: number;
    categoriesToInsert: number;
    categoriesToUpdate: number;
    productsToInsert: number;
    productsToUpdate: number;
    inventoryRecordsToInsert: number;
    inventoryRecordsToSynchronize: number;
    inventoryMovementsToRecord: number;
    importMappingsToRecord: number;
  };
  safetyAudit: {
    profilesUntouched: number;
    ordersUntouched: number;
    cartsUntouched: number;
    databaseMutationsPerformed: 0;
  };
  unresolvedRisks: string[];
}
