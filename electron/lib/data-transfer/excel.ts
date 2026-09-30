// قراءة وكتابة ملفات الإكسل.
//
// ⚠️ القراءة في الـmain process عن قصد — الملف مابيعدّيش على IPC ولا على حزمة
// الواجهة، والمكتبة مابتتشحنش في الـbundle الساكن.

import ExcelJS from "exceljs";
import {
  PRODUCT_HEADERS,
  CUSTOMER_HEADERS,
  PRODUCT_EXPORT_ORDER,
  PRODUCT_EXPORT_LABEL,
  CUSTOMER_EXPORT_LABEL,
  cellText,
  cellNumber,
  normalizePhone,
  nameKey,
  saleTypeLabel,
  type ProductColumn,
  type CustomerColumn,
} from "../../../shared/data-transfer";
import type { ProductRow, CustomerRow } from "./import";

/** أول صف فيه بيانات = الترويسة */
const HEADER_ROW = 1;
const FIRST_DATA_ROW = 2;

/**
 * بيربط أعمدة الملف بالحقول المعروفة.
 *
 * ⚠️ **الترتيب مالوش أي أهمية** — بنقرا الترويسة ونطابق بالاسم. ملف بيتصدّر
 * مننا يرجع يتستورد من غير أي تعديل، وملف المستخدم بأعمدة مرتّبة غلط بيشتغل.
 */
function mapHeaders<K extends string>(
  sheet: ExcelJS.Worksheet,
  known: Record<K, string[]>
): { index: Partial<Record<K, number>>; unknown: string[] } {
  const index: Partial<Record<K, number>> = {};
  const unknown: string[] = [];
  const header = sheet.getRow(HEADER_ROW);

  header.eachCell((cell, col) => {
    const raw = cellText(cell.value);
    if (!raw) return;
    const key = nameKey(raw);
    let matched = false;
    for (const k of Object.keys(known) as K[]) {
      if (index[k] != null) continue;
      if (known[k].some((alias) => nameKey(alias) === key)) {
        index[k] = col;
        matched = true;
        break;
      }
    }
    if (!matched) unknown.push(raw);
  });

  return { index, unknown };
}

async function firstSheet(filePath: string): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("الملف مافيهوش أي شيت");
  return sheet;
}

export async function readProductRows(
  filePath: string
): Promise<{ rows: ProductRow[]; unknownHeaders: string[] }> {
  const sheet = await firstSheet(filePath);
  const { index, unknown } = mapHeaders<ProductColumn>(sheet, PRODUCT_HEADERS);

  if (index.name == null) throw new Error("مالقيناش عمود «الاسم» في الملف");
  if (index.price == null) throw new Error("مالقيناش عمود «السعر» في الملف");

  const get = (r: ExcelJS.Row, c?: number) => (c == null ? "" : cellText(r.getCell(c).value));
  const rows: ProductRow[] = [];

  sheet.eachRow((row, n) => {
    if (n < FIRST_DATA_ROW) return;
    const name = get(row, index.name);
    const priceRaw = index.price != null ? row.getCell(index.price).value : null;
    const costRaw = index.cost != null ? row.getCell(index.cost).value : null;
    // صف فاضي بالكامل بيتجاهل بلا خطأ — إكسل بيسيب صفوف فاضية في الآخر كتير
    if (!name && !cellText(priceRaw)) return;
    rows.push({
      row: n,
      name,
      price: cellNumber(priceRaw),
      barcode: get(row, index.barcode),
      category: get(row, index.category),
      saleType: get(row, index.saleType),
      cost: index.cost == null ? null : cellNumber(costRaw),
    });
  });

  return { rows, unknownHeaders: unknown };
}

export async function readCustomerRows(
  filePath: string
): Promise<{ rows: CustomerRow[]; unknownHeaders: string[] }> {
  const sheet = await firstSheet(filePath);
  const { index, unknown } = mapHeaders<CustomerColumn>(sheet, CUSTOMER_HEADERS);

  if (index.phone == null) throw new Error("مالقيناش عمود «الموبايل» في الملف");

  const rows: CustomerRow[] = [];
  sheet.eachRow((row, n) => {
    if (n < FIRST_DATA_ROW) return;
    const phoneRaw = cellText(row.getCell(index.phone!).value);
    const name = index.name == null ? "" : cellText(row.getCell(index.name).value);
    if (!phoneRaw && !name) return;
    rows.push({ row: n, name, phone: normalizePhone(phoneRaw) });
  });

  return { rows, unknownHeaders: unknown };
}

// ===== الكتابة =====

function styleHeader(sheet: ExcelJS.Worksheet) {
  const h = sheet.getRow(1);
  h.font = { bold: true };
  h.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0EDE8" } };
  });
  // ⚠️ الشيت من اليمين لليسار — الملف عربي والمستخدم بيقراه في إكسل عربي
  sheet.views = [{ rightToLeft: true }];
}

export interface ExportProduct {
  name: string;
  price: number;
  cost_price: number;
  barcode: string | null;
  category_name: string | null;
  sale_type: "piece" | "weight";
}

export async function writeProducts(filePath: string, rows: ExportProduct[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("المنتجات");
  sheet.columns = PRODUCT_EXPORT_ORDER.map((k) => ({
    header: PRODUCT_EXPORT_LABEL[k],
    key: k,
    width: k === "name" ? 32 : 16,
  }));
  for (const p of rows) {
    sheet.addRow({
      name: p.name,
      price: p.price,
      cost: p.cost_price,
      // ⚠️ الباركود نص مش رقم — إكسل بيحوّل الأرقام الطويلة لصيغة علمية
      // (`6.223E+12`) والملف يرجع يتستورد بباركود مكسور
      barcode: p.barcode ?? "",
      category: p.category_name ?? "",
      saleType: saleTypeLabel(p.sale_type),
    });
  }
  sheet.getColumn("barcode").numFmt = "@";
  styleHeader(sheet);
  await wb.xlsx.writeFile(filePath);
}

export interface ExportCustomer {
  name: string;
  phone: string | null;
}

export async function writeCustomers(filePath: string, rows: ExportCustomer[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("العملاء");
  sheet.columns = (["name", "phone"] as CustomerColumn[]).map((k) => ({
    header: CUSTOMER_EXPORT_LABEL[k],
    key: k,
    width: k === "name" ? 32 : 18,
  }));
  for (const c of rows) sheet.addRow({ name: c.name, phone: c.phone ?? "" });
  sheet.getColumn("phone").numFmt = "@";
  styleHeader(sheet);
  await wb.xlsx.writeFile(filePath);
}

/** قالب فاضي بصفّين مثال — من غيره المستخدم بيخمّن أسماء الأعمدة */
export async function writeProductTemplate(filePath: string): Promise<void> {
  await writeProducts(filePath, [
    { name: "بيبسي ٢٫٥ لتر", price: 30, cost_price: 24, barcode: "6223000083758", category_name: "مشروبات", sale_type: "piece" },
    { name: "طماطم", price: 18, cost_price: 12, barcode: null, category_name: "خضار", sale_type: "weight" },
  ]);
}

export async function writeCustomerTemplate(filePath: string): Promise<void> {
  await writeCustomers(filePath, [
    { name: "أحمد محمد", phone: "01012345678" },
    { name: "", phone: "01199887766" },
  ]);
}
