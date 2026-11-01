import { resolveCataloguePaths, loadCsvProducts, loadExcelProducts } from './catalogue/catalogue-validation';

const { csvPath, excelPath } = resolveCataloguePaths();
const csv = loadCsvProducts(csvPath);
const { products: excel } = loadExcelProducts(excelPath);

const fractionals: any[] = [];
for (const e of excel) {
  if (!Number.isInteger(e.stockQty)) {
    // Find matching by rowNum or compound key
    const c = csv.find((x) => x.sourceRowNumber === e.sourceRowNumber);
    fractionals.push({
      sourceRowNumber: e.sourceRowNumber,
      productName: e.productName,
      brandName: e.brandName,
      categoryName: e.categoryName,
      excelStock: e.stockQty,
      csvStock: c ? c.stockQty : null,
      flooredStock: Math.floor(e.stockQty),
      effectiveInventoryStock: Math.max(0, Math.floor(e.stockQty)),
      isFlooredToZero: e.stockQty > 0 && e.stockQty < 1,
      isNegativeFractional: e.stockQty < 0,
    });
  }
}

console.log('Total fractional records in Excel:', fractionals.length);

const flooredToZero = fractionals.filter((f) => f.isFlooredToZero);
console.log('Positive fractional floored to zero count:', flooredToZero.length);
console.log('Positive fractional floored to zero items:', JSON.stringify(flooredToZero, null, 2));

const negFractionals = fractionals.filter((f) => f.isNegativeFractional);
console.log('Negative fractional count:', negFractionals.length);
console.log('Negative fractional items:', JSON.stringify(negFractionals, null, 2));

// Check why Phase B printed 10:
// In Phase B, analyze-sources.ts printed diffs.slice(0, 10).
// In that script: diffs.push(...) when Math.abs(c.stockQty - e.stockQty) > 0.01,
// and it did console.log(JSON.stringify(diffs.slice(0, 10)))!
console.log('Check if diffs.slice(0, 10) was the reason for 10:');
const stockDiffs = [];
for (let i = 0; i < Math.min(csv.length, excel.length); i++) {
  if (Math.abs(csv[i].stockQty - excel[i].stockQty) > 0.001) {
    stockDiffs.push(i);
  }
}
console.log('Total stock diffs between CSV and Excel when compared by index:', stockDiffs.length);
