import { resolveCataloguePaths, loadExcelProducts } from './catalogue/catalogue-validation';

const { excelPath } = resolveCataloguePaths();
const { products: excel } = loadExcelProducts(excelPath);

let catPositive = 0; // Category 1: Positive integer stock after flooring (> 0)
let catZero = 0;     // Category 2: Original zero stock (raw == 0)
let catNegative = 0; // Category 3: Negative stock (raw < 0)
let catFlooredZero = 0; // Category 4: Positive fractional stock floored to zero (0 < raw < 1)

const positiveRows: number[] = [];
const zeroRows: number[] = [];
const negativeRows: number[] = [];
const flooredZeroRows: number[] = [];

for (const p of excel) {
  const raw = p.stockQty;
  if (raw < 0) {
    catNegative++;
    negativeRows.push(p.sourceRowNumber);
  } else if (raw === 0) {
    catZero++;
    zeroRows.push(p.sourceRowNumber);
  } else if (raw > 0 && raw < 1) {
    catFlooredZero++;
    flooredZeroRows.push(p.sourceRowNumber);
  } else if (Math.floor(raw) > 0) {
    catPositive++;
    positiveRows.push(p.sourceRowNumber);
  } else {
    console.error('Uncategorized row:', p);
  }
}

console.log('=== MUTUALLY EXCLUSIVE STOCK CATEGORIES ===');
console.log('Category 1: Positive integer stock after flooring (> 0):', catPositive);
console.log('Category 2: Original zero stock (raw == 0):             ', catZero);
console.log('Category 3: Negative stock (raw < 0):                    ', catNegative);
console.log('Category 4: Positive fractional floored to zero (0<raw<1):', catFlooredZero);
console.log('SUM:', catPositive + catZero + catNegative + catFlooredZero);
console.log('Matches 1944 exactly?', (catPositive + catZero + catNegative + catFlooredZero) === 1944);

console.log('\nNegative rows (31):', JSON.stringify(negativeRows));
console.log('\nPositive fractional floored to zero rows (6):', JSON.stringify(flooredZeroRows));
