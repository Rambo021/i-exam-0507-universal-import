import { FieldConfig, OrderField, OrderRow, ValidationError, fieldConfigs } from "./types";

const temperatureZones = new Set(["常温", "冷藏", "冷冻"]);

function isBlank(value: string) {
  return !String(value ?? "").trim();
}

function isValidPhone(value: string) {
  const normalized = value.trim().replace(/[ -]/g, "");
  return /^(1[3-9]\d{9}|0\d{2,3}\d{7,8}|\d{7,12})$/.test(normalized);
}

function getFieldConfig(field: OrderField): FieldConfig {
  return fieldConfigs.find((item) => item.key === field)!;
}

function pushError(errors: ValidationError[], row: OrderRow, rowIndex: number, field: OrderField, message: string) {
  errors.push({
    rowId: row.id,
    rowIndex,
    field,
    fieldLabel: getFieldConfig(field).label,
    message,
  });
}

export function validateRows(rows: OrderRow[], historicalDuplicates = new Set<string>()) {
  const errors: ValidationError[] = [];
  const externalCodeMap = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const rowIndex = index + 1;
    for (const config of fieldConfigs) {
      if (config.required && isBlank(row[config.key])) {
        pushError(errors, row, rowIndex, config.key, "不能为空");
      }
    }

    if (!isBlank(row.senderPhone) && !isValidPhone(row.senderPhone)) {
      pushError(errors, row, rowIndex, "senderPhone", "格式错误");
    }
    if (!isBlank(row.receiverPhone) && !isValidPhone(row.receiverPhone)) {
      pushError(errors, row, rowIndex, "receiverPhone", "格式错误");
    }

    const weight = Number(row.weight);
    if (!isBlank(row.weight) && (!Number.isFinite(weight) || weight <= 0)) {
      pushError(errors, row, rowIndex, "weight", "必须为正数");
    }

    const quantity = Number(row.quantity);
    if (!isBlank(row.quantity) && (!Number.isInteger(quantity) || quantity <= 0)) {
      pushError(errors, row, rowIndex, "quantity", "必须为正整数");
    }

    if (!isBlank(row.temperatureZone) && !temperatureZones.has(row.temperatureZone.trim())) {
      pushError(errors, row, rowIndex, "temperatureZone", "只能是常温/冷藏/冷冻");
    }

    const externalCode = row.externalCode.trim();
    if (externalCode) {
      const rowsWithCode = externalCodeMap.get(externalCode) ?? [];
      rowsWithCode.push(rowIndex);
      externalCodeMap.set(externalCode, rowsWithCode);
      if (historicalDuplicates.has(externalCode)) {
        pushError(errors, row, rowIndex, "externalCode", "与历史运单重复");
      }
    }
  });

  externalCodeMap.forEach((indexes, externalCode) => {
    if (indexes.length < 2) return;
    rows.forEach((row, index) => {
      if (row.externalCode.trim() !== externalCode) return;
      const rowIndex = index + 1;
      const other = indexes.find((item) => item !== rowIndex);
      pushError(errors, row, rowIndex, "externalCode", `与第 ${other} 行重复`);
    });
  });

  return errors;
}

export function formatError(error: ValidationError) {
  return `第 ${error.rowIndex} 行，${error.fieldLabel}：${error.message}`;
}
