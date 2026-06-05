import * as XLSX from "xlsx";
import { ShipmentRow, fieldConfigs } from "./types";

export function exportShipments(rows: ShipmentRow[]) {
  const headers = fieldConfigs.map((field) => field.label);
  const body = rows.map((row) => fieldConfigs.map((field) => row[field.key]));
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "出库单数据");
  XLSX.writeFile(workbook, `shipments-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
