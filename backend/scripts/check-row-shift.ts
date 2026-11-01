import { resolveCataloguePaths, loadCsvProducts, loadExcelProducts } from './catalogue/catalogue-validation';

const { csvPath, excelPath } = resolveCataloguePaths();
const csv = loadCsvProducts(csvPath);
const { products: excel } = loadExcelProducts(excelPath);

console.log('CSV row 436:', csv[435]);
console.log('CSV row 437:', csv[436]);
console.log('CSV row 438:', csv[437]);

console.log('Excel row 436:', excel[435]);
console.log('Excel row 437:', excel[436]);
console.log('Excel row 438:', excel[437]);

const excelIdx = excel.findIndex(p => p.productName.includes('Coupler MT/MT'));
console.log('Excel index of Coupler MT/MT:', excelIdx, excelIdx !== -1 ? excel[excelIdx] : null);

const csvIdx = csv.findIndex(p => p.productName.includes('3"x1.5" R/Socket Pvc'));
console.log('CSV index of 3"x1.5" R/Socket Pvc:', csvIdx, csvIdx !== -1 ? csv[csvIdx] : null);
