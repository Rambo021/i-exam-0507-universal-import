export const orderFields = [
  "externalCode",
  "senderName",
  "senderPhone",
  "senderAddress",
  "receiverName",
  "receiverPhone",
  "receiverAddress",
  "weight",
  "quantity",
  "temperatureZone",
  "remark",
] as const;

export type OrderField = (typeof orderFields)[number];

export type OrderRow = Record<OrderField, string> & {
  id: string;
};

export type FieldConfig = {
  key: OrderField;
  label: string;
  required: boolean;
  width: string;
};

export type ColumnMapping = Partial<Record<OrderField, number>>;

export type MappingDraft = {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  fingerprint: string;
  mapping: ColumnMapping;
  fromMemory: boolean;
  confidence: number;
};

export type ParseResult = MappingDraft & {
  rows: OrderRow[];
  sourceRows: string[][];
  totalRows: number;
};

export type ValidationError = {
  rowId: string;
  rowIndex: number;
  field: OrderField;
  fieldLabel: string;
  message: string;
};

export type ImportedOrder = {
  id: string;
  externalCode: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  weight: string;
  quantity: string;
  temperatureZone: string;
  remark: string;
  importBatchId: string;
  createdAt: string;
};

export const fieldConfigs: FieldConfig[] = [
  { key: "externalCode", label: "外部编码", required: false, width: "150px" },
  { key: "senderName", label: "发件人姓名", required: true, width: "130px" },
  { key: "senderPhone", label: "发件人电话", required: true, width: "150px" },
  { key: "senderAddress", label: "发件人地址", required: true, width: "260px" },
  { key: "receiverName", label: "收件人姓名", required: true, width: "130px" },
  { key: "receiverPhone", label: "收件人电话", required: true, width: "150px" },
  { key: "receiverAddress", label: "收件人地址", required: true, width: "260px" },
  { key: "weight", label: "重量(kg)", required: true, width: "110px" },
  { key: "quantity", label: "件数", required: true, width: "100px" },
  { key: "temperatureZone", label: "温层", required: true, width: "110px" },
  { key: "remark", label: "备注", required: false, width: "180px" },
];
