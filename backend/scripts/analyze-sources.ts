import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';

const csvPath = path.resolve(__dirname, '../../databse/catalogue-import/catalogue_import_clean.csv');
const excelPath = path.resolve(__dirname, '../../databse/catalogue-import/Combined_Product_Price_List .xlsx');

interface AnalysisResult {
  csv: {
    totalRows: number;
    validProductRows: number;
    uniqueNames: number;
    uniqueBrands: number;
    uniqueCategories: number;
    productsWithoutBrand: number;
    productsWithoutCategory: number;
    zeroStock: number;
    negativeStock: number;
    positiveStock: number;
    invalidPrices: number;
    discountInconsistencies: number;
    duplicateNames: { name: string; count: number }[];
    duplicateRowNumbers: number[];
  };
  excel: {
    sheetNames: string[];
    priceListRows: number;
    brandComparisonHeaders: string[];
    brandComparisonGroupsCount: number;
    summaryBrandRows: number;
    summaryCategoryRows: number;
  };
  reconciliation: {
    rowCountMatch: boolean;
    differences: any[];
  };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

async function analyze() {
  console.log('--- Reading CSV ---');
  const csvRaw = fs.readFileSync(csvPath, 'utf8');
  const csvLines = csvRaw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCSVLine(csvLines[0].replace(/^\uFEFF/, ''));
  console.log('CSV Header:', header);

  const csvRows: any[] = [];
  const nameCounts = new Map<string, number>();
  const brands = new Set<string>();
  const categories = new Set<string>();
  const rowNumbers = new Set<number>();
  const dupRowNumbers: number[] = [];
  let unbranded = 0;
  let uncategorized = 0;
  let zeroStock = 0;
  let negStock = 0;
  let posStock = 0;
  let invalidPrices = 0;
  let discountInconsistencies = 0;

  for (let i = 1; i < csvLines.length; i++) {
    const cols = parseCSVLine(csvLines[i]);
    const batchId = cols[0];
    const rowNum = parseInt(cols[1], 10);
    const prodName = (cols[2] || '').trim();
    const brandName = (cols[3] || '').trim();
    const mrp = parseFloat(cols[4]);
    const discount = parseFloat(cols[5]);
    const sellingPrice = parseFloat(cols[6]);
    const stockQty = parseFloat(cols[7]);
    const catName = (cols[8] || '').trim();

    if (rowNumbers.has(rowNum)) {
      dupRowNumbers.push(rowNum);
    }
    rowNumbers.add(rowNum);

    if (!prodName) console.warn('Row with missing product name:', i);
    nameCounts.set(prodName, (nameCounts.get(prodName) || 0) + 1);

    if (!brandName) unbranded++;
    else brands.add(brandName);

    if (!catName) uncategorized++;
    else categories.add(catName);

    if (stockQty === 0) zeroStock++;
    else if (stockQty < 0) negStock++;
    else posStock++;

    if (isNaN(mrp) || mrp < 0 || isNaN(sellingPrice) || sellingPrice < 0) {
      invalidPrices++;
    }

    // Check discount formula consistency: Selling Price = MRP * (1 - Discount/100)
    if (!isNaN(mrp) && !isNaN(discount) && !isNaN(sellingPrice)) {
      const calculatedSp = Math.round(mrp * (1 - discount / 100) * 100) / 100;
      if (Math.abs(calculatedSp - sellingPrice) > 1) {
        discountInconsistencies++;
      }
    }

    csvRows.push({
      batchId,
      rowNum,
      prodName,
      brandName,
      mrp,
      discount,
      sellingPrice,
      stockQty,
      catName,
    });
  }

  const dupNames = Array.from(nameCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  console.log('--- Reading Excel ---');
  const wb = xlsx.readFile(excelPath);
  console.log('Excel Sheets:', wb.SheetNames);

  // Combined Price List sheet
  const wsPrice = wb.Sheets['Combined Price List'];
  const rawPriceRows: any[][] = xlsx.utils.sheet_to_json(wsPrice, { header: 1 });
  // Find header row in sheet
  let headerRowIdx = -1;
  for (let r = 0; r < 10; r++) {
    if (rawPriceRows[r] && rawPriceRows[r][0] === 'Product') {
      headerRowIdx = r;
      break;
    }
  }

  const excelProducts: any[] = [];
  for (let r = headerRowIdx + 1; r < rawPriceRows.length; r++) {
    const row = rawPriceRows[r];
    if (!row || !row[0]) continue;
    excelProducts.push({
      rowNum: excelProducts.length + 1,
      product: String(row[0] || '').trim(),
      brand: row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '',
      mrp: Number(row[2]),
      discount: Number(row[3]),
      sellingPrice: Number(row[4]),
      stockQty: Number(row[5]),
      category: row[6] !== undefined && row[6] !== null ? String(row[6]).trim() : '',
    });
  }

  // Brand Comparison sheet
  const wsComp = wb.Sheets['Brand Comparison'];
  const rawCompRows: any[][] = xlsx.utils.sheet_to_json(wsComp, { header: 1 });
  let compHeaders: string[] = [];
  let compGroups = 0;
  for (let r = 0; r < rawCompRows.length; r++) {
    const row = rawCompRows[r];
    if (row && row[0] === 'Product') {
      compHeaders = row;
    }
    if (row && typeof row[0] === 'string' && row[0].includes('(') && row[0].includes('items)')) {
      compGroups++;
    }
  }

  // Reconciliation between CSV and Excel Combined Price List
  const diffs: any[] = [];
  for (let i = 0; i < Math.max(csvRows.length, excelProducts.length); i++) {
    const c = csvRows[i];
    const e = excelProducts[i];
    if (!c || !e) {
      diffs.push({ index: i, csv: c ? c.prodName : null, excel: e ? e.product : null, type: 'MISSING_ROW' });
      continue;
    }
    if (
      c.prodName !== e.product ||
      c.brandName !== e.brand ||
      c.catName !== e.category ||
      Math.abs(c.mrp - e.mrp) > 0.01 ||
      Math.abs(c.sellingPrice - e.sellingPrice) > 0.01 ||
      Math.abs(c.stockQty - e.stockQty) > 0.01
    ) {
      diffs.push({
        row: i + 1,
        csv: { name: c.prodName, brand: c.brandName, cat: c.catName, sp: c.sellingPrice, stock: c.stockQty },
        excel: { name: e.product, brand: e.brand, cat: e.category, sp: e.sellingPrice, stock: e.stockQty },
      });
    }
  }

  const analysis: AnalysisResult = {
    csv: {
      totalRows: csvLines.length - 1,
      validProductRows: csvRows.length,
      uniqueNames: nameCounts.size,
      uniqueBrands: brands.size,
      uniqueCategories: categories.size,
      productsWithoutBrand: unbranded,
      productsWithoutCategory: uncategorized,
      zeroStock,
      negativeStock: negStock,
      positiveStock: posStock,
      invalidPrices,
      discountInconsistencies,
      duplicateNames: dupNames.slice(0, 15),
      duplicateRowNumbers: dupRowNumbers,
    },
    excel: {
      sheetNames: wb.SheetNames,
      priceListRows: excelProducts.length,
      brandComparisonHeaders: compHeaders,
      brandComparisonGroupsCount: compGroups,
      summaryBrandRows: (xlsx.utils.sheet_to_json(wb.Sheets['Summary by Brand'], { header: 1 }) as any[]).length,
      summaryCategoryRows: (xlsx.utils.sheet_to_json(wb.Sheets['Summary by Category'], { header: 1 }) as any[]).length,
    },
    reconciliation: {
      rowCountMatch: csvRows.length === excelProducts.length,
      differences: diffs.slice(0, 10),
    },
  };

  console.log('=== ANALYSIS RESULT ===');
  console.log(JSON.stringify(analysis, null, 2));
}

analyze();
