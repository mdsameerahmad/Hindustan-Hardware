import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { RawSourceProduct, ComparisonGroup, SourceDiscrepancy } from './catalogue-types';

export function resolveCataloguePaths() {
  const root = path.resolve(__dirname, '../../..');
  const csvPath = path.resolve(root, 'databse/catalogue-import/catalogue_import_clean.csv');
  const excelPath = path.resolve(root, 'databse/catalogue-import/Combined_Product_Price_List .xlsx');

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at: ${csvPath}`);
  }
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel file not found at: ${excelPath}`);
  }

  return { csvPath, excelPath };
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

export function loadCsvProducts(csvPath: string): RawSourceProduct[] {
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const products: RawSourceProduct[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 9) continue;
    const rowNum = parseInt(cols[1], 10);
    const prodName = (cols[2] || '').trim();
    const brandName = (cols[3] || '').trim();
    const mrp = parseFloat(cols[4]);
    const discount = parseFloat(cols[5]);
    const sp = parseFloat(cols[6]);
    const stock = parseFloat(cols[7]);
    const catName = (cols[8] || '').trim();

    products.push({
      sourceRowNumber: isNaN(rowNum) ? i : rowNum,
      productName: prodName,
      brandName: brandName,
      categoryName: catName,
      mrp: isNaN(mrp) ? 0 : mrp,
      discountPercent: isNaN(discount) ? 0 : discount,
      sellingPrice: isNaN(sp) ? 0 : sp,
      stockQty: isNaN(stock) ? 0 : stock,
    });
  }

  return products;
}

export function loadExcelProducts(excelPath: string): {
  products: RawSourceProduct[];
  comparisonGroups: ComparisonGroup[];
} {
  const wb = xlsx.readFile(excelPath);

  // 1. Load Combined Price List
  const wsPrice = wb.Sheets['Combined Price List'];
  if (!wsPrice) {
    throw new Error("Worksheet 'Combined Price List' not found in Excel workbook.");
  }

  const rawRows: any[][] = xlsx.utils.sheet_to_json(wsPrice, { header: 1 });
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    if (rawRows[r] && rawRows[r][0] === 'Product') {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new Error("Header row starting with 'Product' not found in 'Combined Price List'.");
  }

  const products: RawSourceProduct[] = [];
  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !row[0]) continue;
    const prodName = String(row[0] || '').trim();
    const brandName = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '';
    const mrp = Number(row[2]);
    const discount = Number(row[3]);
    const sp = Number(row[4]);
    const stock = Number(row[5]);
    const catName = row[6] !== undefined && row[6] !== null ? String(row[6]).trim() : '';

    products.push({
      sourceRowNumber: products.length + 1,
      productName: prodName,
      brandName: brandName,
      categoryName: catName,
      mrp: isNaN(mrp) ? 0 : mrp,
      discountPercent: isNaN(discount) ? 0 : discount,
      sellingPrice: isNaN(sp) ? 0 : sp,
      stockQty: isNaN(stock) ? 0 : stock,
    });
  }

  // 2. Load Brand Comparison Groups
  const wsComp = wb.Sheets['Brand Comparison'];
  const comparisonGroups: ComparisonGroup[] = [];

  if (wsComp) {
    const rawCompRows: any[][] = xlsx.utils.sheet_to_json(wsComp, { header: 1 });
    let currentGroup: ComparisonGroup | null = null;

    for (let r = 3; r < rawCompRows.length; r++) {
      const row = rawCompRows[r];
      if (!row || row.length === 0) continue;

      const firstCell = String(row[0] || '').trim();

      // Check if group header e.g. "Angle Cock (24 brands/items)"
      if (firstCell.includes('(') && firstCell.includes('items)')) {
        const groupName = firstCell.replace(/\s*\(\d+.*$/, '').trim();
        currentGroup = {
          groupName,
          rawHeader: firstCell,
          items: [],
        };
        comparisonGroups.push(currentGroup);
        continue;
      }

      // If within a group and this is a product row
      if (currentGroup && row[0] && row[1] && row[0] !== 'Product') {
        const pName = String(row[0] || '').trim();
        const bName = String(row[1] || '').trim();
        const size = row[2] !== undefined && row[2] !== null ? String(row[2]).trim() : undefined;
        const type = row[3] !== undefined && row[3] !== null ? String(row[3]).trim() : undefined;
        const mat = row[4] !== undefined && row[4] !== null ? String(row[4]).trim() : undefined;
        const mrp = Number(row[5]) || 0;
        const sp = Number(row[6]) || 0;
        const stock = Number(row[7]) || 0;

        currentGroup.items.push({
          productName: pName,
          brandName: bName,
          size,
          type,
          material: mat,
          mrp,
          sellingPrice: sp,
          stockQty: stock,
        });
      }
    }
  }

  return { products, comparisonGroups };
}

export function reconcileSourceFiles(
  csvProducts: RawSourceProduct[],
  excelProducts: RawSourceProduct[]
): SourceDiscrepancy[] {
  const discrepancies: SourceDiscrepancy[] = [];

  if (csvProducts.length !== excelProducts.length) {
    discrepancies.push({
      rowNumber: 0,
      field: 'rowCount',
      csvValue: csvProducts.length,
      excelValue: excelProducts.length,
      severity: 'error',
      note: `Row count mismatch: CSV has ${csvProducts.length} rows, Excel has ${excelProducts.length} rows.`,
    });
  }

  // 1. Build lookup by compound key: brand + "|||" + category + "|||" + productName + "|||" + mrp
  const makeKey = (p: RawSourceProduct) =>
    `${(p.brandName || '').trim().toLowerCase()}|||${(p.categoryName || '').trim().toLowerCase()}|||${p.productName.trim().toLowerCase()}|||${p.mrp}`;

  const excelMap = new Map<string, RawSourceProduct>();
  for (const e of excelProducts) {
    excelMap.set(makeKey(e), e);
  }

  for (const c of csvProducts) {
    const key = makeKey(c);
    const e = excelMap.get(key);

    if (!e) {
      discrepancies.push({
        rowNumber: c.sourceRowNumber,
        field: 'productPresence',
        csvValue: c.productName,
        excelValue: null,
        severity: 'error',
        note: `Product '${c.productName}' in CSV row ${c.sourceRowNumber} not found in Excel workbook.`,
      });
      continue;
    }

    if (Math.abs(c.sellingPrice - e.sellingPrice) > 0.01) {
      discrepancies.push({
        rowNumber: c.sourceRowNumber,
        field: 'sellingPrice',
        csvValue: c.sellingPrice,
        excelValue: e.sellingPrice,
        severity: 'error',
        note: `Selling price mismatch for '${c.productName}': CSV ${c.sellingPrice} vs Excel ${e.sellingPrice}`,
      });
    }

    // Decimal stock difference check: CSV truncated to integer, Excel preserved decimal
    if (Math.abs(c.stockQty - e.stockQty) > 0.001) {
      discrepancies.push({
        rowNumber: c.sourceRowNumber,
        field: 'stockQty',
        csvValue: c.stockQty,
        excelValue: e.stockQty,
        severity: 'warning',
        note: `Decimal stock difference for '${c.productName}': Excel has fractional ${e.stockQty}, CSV truncated to ${c.stockQty}. Exact Excel value preserved in specs & audit.`,
      });
    }

    // Note row shift if source row positions differ between CSV and Excel
    if (c.sourceRowNumber !== e.sourceRowNumber) {
      discrepancies.push({
        rowNumber: c.sourceRowNumber,
        field: 'rowPosition',
        csvValue: c.sourceRowNumber,
        excelValue: e.sourceRowNumber,
        severity: 'warning',
        note: `Row order difference for '${c.productName}': CSV row ${c.sourceRowNumber} vs Excel row ${e.sourceRowNumber}. Natural key identity handles reordering gracefully.`,
      });
    }
  }

  return discrepancies;
}
