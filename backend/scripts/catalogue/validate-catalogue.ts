import {
  resolveCataloguePaths,
  loadCsvProducts,
  loadExcelProducts,
  reconcileSourceFiles,
} from './catalogue-validation';
import {
  buildBrandRegistry,
  buildCategoryRegistry,
  mapAndValidateProducts,
} from './catalogue-mapping';
import { generateAllReports, getReportDirectories } from './catalogue-report';

export async function runCatalogueValidation() {
  console.log('===============================================================');
  console.log('   HINDUSTAN HARDWARE — MASTER CATALOGUE VALIDATION ENGINE     ');
  console.log('===============================================================\n');

  const { csvPath, excelPath } = resolveCataloguePaths();
  console.log(`[1/5] Loading source files:`);
  console.log(`      CSV:   ${csvPath}`);
  console.log(`      Excel: ${excelPath}`);

  const csvProducts = loadCsvProducts(csvPath);
  console.log(`      Parsed CSV products: ${csvProducts.length}`);

  const { products: excelProducts, comparisonGroups } = loadExcelProducts(excelPath);
  console.log(`      Parsed Excel products: ${excelProducts.length}`);
  console.log(`      Parsed Brand Comparison Groups: ${comparisonGroups.length}`);

  console.log(`\n[2/5] Reconciling CSV and Excel records...`);
  const discrepancies = reconcileSourceFiles(csvProducts, excelProducts);
  const errorDiscrepancies = discrepancies.filter((d) => d.severity === 'error');
  const warningDiscrepancies = discrepancies.filter((d) => d.severity === 'warning');
  console.log(`      Critical text/price errors: ${errorDiscrepancies.length}`);
  console.log(`      Decimal stock warnings:    ${warningDiscrepancies.length}`);

  console.log(`\n[3/5] Building Brand & Category Registries...`);
  const brandRegistry = buildBrandRegistry(excelProducts);
  const categoryRegistry = buildCategoryRegistry(excelProducts);
  console.log(`      Normalized Brands:     ${brandRegistry.size}`);
  console.log(`      Normalized Categories: ${categoryRegistry.size}`);

  console.log(`\n[4/5] Running Deterministic Mapping & Identity Disambiguation...`);
  const { validatedProducts, slugCollisions, skuCollisions } = mapAndValidateProducts(
    excelProducts,
    brandRegistry,
    categoryRegistry,
    comparisonGroups
  );

  const validCount = validatedProducts.filter((p) => p.validationErrors.length === 0).length;
  const invalidCount = validatedProducts.filter((p) => p.validationErrors.length > 0).length;
  const zeroStock = validatedProducts.filter((p) => p.isZeroStock).length;
  const negStock = validatedProducts.filter((p) => p.isNegativeStock).length;
  const fracStock = validatedProducts.filter((p) => p.isFractionalStock).length;
  const compMapped = validatedProducts.filter((p) => p.comparisonGroupId !== null).length;
  const unbranded = validatedProducts.filter((p) => !p.brandName).length;

  console.log(`      Validated Products:    ${validatedProducts.length}`);
  console.log(`      Valid Rows:            ${validCount}`);
  console.log(`      Invalid Rows:          ${invalidCount}`);
  console.log(`      Unbranded Products:    ${unbranded}`);
  console.log(`      Zero Stock Rows:       ${zeroStock}`);
  console.log(`      Negative Stock Rows:   ${negStock} (safely clamped to 0)`);
  console.log(`      Fractional Stock Rows: ${fracStock} (exact decimal preserved in specs)`);
  console.log(`      Comparison Mapped:     ${compMapped}`);
  console.log(`      Slug Collisions:       ${slugCollisions.length}`);
  console.log(`      SKU Collisions:        ${skuCollisions.length}`);

  console.log(`\n[5/5] Generating All 9 Comprehensive Reports...`);
  const batchId = '11111111-1111-4111-8111-111111111111';
  generateAllReports({
    batchId,
    validatedProducts,
    brands: Array.from(brandRegistry.values()),
    categories: Array.from(categoryRegistry.values()),
    discrepancies,
    comparisonGroups,
    slugCollisions,
    skuCollisions,
  });

  const dirs = getReportDirectories();
  console.log(`\nAll 9 reports successfully generated in:`);
  dirs.forEach((d) => console.log(` - ${d}`));

  console.log('\n===============================================================');
  console.log('                 VALIDATION RUN COMPLETE                       ');
  console.log('===============================================================\n');

  return {
    validCount,
    invalidCount,
    totalCount: validatedProducts.length,
    slugCollisions: slugCollisions.length,
    skuCollisions: skuCollisions.length,
  };
}

if (require.main === module) {
  runCatalogueValidation().catch((err) => {
    console.error('Fatal Validation Error:', err);
    process.exit(1);
  });
}
