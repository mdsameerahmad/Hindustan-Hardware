import { resolveCataloguePaths, loadCsvProducts, loadExcelProducts } from './catalogue/catalogue-validation';

const { csvPath, excelPath } = resolveCataloguePaths();
const csv = loadCsvProducts(csvPath);
const { products: excel } = loadExcelProducts(excelPath);

console.log('Comparing sets of products:');

const makeKey = (p: any) => `${(p.brandName || '').trim().toLowerCase()}|||${(p.categoryName || '').trim().toLowerCase()}|||${p.productName.trim().toLowerCase()}|||${p.mrp}`;

const csvKeys = new Set(csv.map(makeKey));
const excelKeys = new Set(excel.map(makeKey));

console.log('CSV unique keys count:', csvKeys.size);
console.log('Excel unique keys count:', excelKeys.size);

const inCsvNotExcel = Array.from(csvKeys).filter(k => !excelKeys.has(k));
const inExcelNotCsv = Array.from(excelKeys).filter(k => !csvKeys.has(k));

console.log('In CSV but not in Excel:', inCsvNotExcel.length, inCsvNotExcel);
console.log('In Excel but not in CSV:', inExcelNotCsv.length, inExcelNotCsv);
