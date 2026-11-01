import { resolveCataloguePaths, loadCsvProducts, loadExcelProducts, reconcileSourceFiles } from './catalogue/catalogue-validation';

const { csvPath, excelPath } = resolveCataloguePaths();
const csv = loadCsvProducts(csvPath);
const { products: excel } = loadExcelProducts(excelPath);

console.log('CSV length:', csv.length);
console.log('Excel length:', excel.length);

console.log('CSV row 0:', csv[0]);
console.log('Excel row 0:', excel[0]);

console.log('CSV row 1:', csv[1]);
console.log('Excel row 1:', excel[1]);

const diffs = reconcileSourceFiles(csv, excel);
console.log('Total diffs:', diffs.length);
const errors = diffs.filter(d => d.severity === 'error');
console.log('Error discrepancies count:', errors.length);
for (let i = 0; i < Math.min(10, errors.length); i++) {
  console.log('Error', i, errors[i]);
}

const warnings = diffs.filter(d => d.severity === 'warning');
console.log('Warning discrepancies count:', warnings.length);
for (let i = 0; i < Math.min(5, warnings.length); i++) {
  console.log('Warning', i, warnings[i]);
}

let fractionalCount = 0;
for (const p of excel) {
  if (!Number.isInteger(p.stockQty)) {
    fractionalCount++;
    if (fractionalCount <= 15) {
      console.log('Fractional stock:', p.productName, p.brandName, p.stockQty);
    }
  }
}
console.log('Total fractional count in Excel:', fractionalCount);
