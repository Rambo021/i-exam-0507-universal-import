export const shipmentFields = [
  "externalCode",
  "storeName",
  "receiverName",
  "receiverPhone",
  "receiverAddress",
  "skuCode",
  "skuName",
  "quantity",
  "spec",
  "remark",
] as const;

export type ShipmentField = (typeof shipmentFields)[number];

export type ShipmentRow = Record<ShipmentField, string> & {
  id: string;
  orderKey?: string;
  source?: {
    sheetName?: string;
    rowIndex?: number;
    blockIndex?: number;
    page?: number;
  };
};

export type ShipmentOrder = {
  id: string;
  externalCode: string;
  storeName: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  remark: string;
  items: ShipmentItem[];
  importBatchId?: string;
  createdAt?: string;
};

export type ShipmentItem = {
  id: string;
  skuCode: string;
  skuName: string;
  quantity: string;
  spec: string;
};

export type FieldConfig = {
  key: ShipmentField;
  label: string;
  required: boolean;
  width: string;
};

export type ValidationError = {
  rowId: string;
  rowIndex: number;
  field: ShipmentField;
  fieldLabel: string;
  message: string;
};

export type ImportedShipmentRow = ShipmentRow & {
  orderId: string;
  itemId: string;
  importBatchId: string;
  createdAt: string;
};

export const fieldConfigs: FieldConfig[] = [
  { key: "externalCode", label: "外部编码", required: false, width: "150px" },
  { key: "storeName", label: "收货门店", required: false, width: "180px" },
  { key: "receiverName", label: "收件人姓名", required: false, width: "130px" },
  { key: "receiverPhone", label: "收件人电话", required: false, width: "150px" },
  { key: "receiverAddress", label: "收件人地址", required: false, width: "280px" },
  { key: "skuCode", label: "SKU物品编码", required: true, width: "150px" },
  { key: "skuName", label: "SKU物品名称", required: true, width: "220px" },
  { key: "quantity", label: "SKU发货数量", required: true, width: "120px" },
  { key: "spec", label: "SKU规格型号", required: false, width: "160px" },
  { key: "remark", label: "备注", required: false, width: "200px" },
];

export type ApiErrorResponse = {
  error: string;
  details?: unknown;
};

export type ImportProgress = {
  label: string;
  processed: number;
  total: number;
};
