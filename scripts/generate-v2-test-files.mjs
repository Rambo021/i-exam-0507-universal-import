import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const outDir = path.resolve("test-excels-v2");
fs.mkdirSync(outDir, { recursive: true });

function writeBook(fileName, sheets) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
    if (sheet.merges) worksheet["!merges"] = sheet.merges;
    if (sheet.cols) worksheet["!cols"] = sheet.cols;
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  XLSX.writeFile(workbook, path.join(outDir, fileName));
}

const stores = [
  ["尹三顺自助烤肉（银泰店）", "张三", "13800138001", "浙江省杭州市拱墅区延安路530号银泰A座"],
  ["欢乐牧场（龙湖天街店）", "李四", "13900139002", "重庆市渝北区龙湖天街6号"],
  ["黔寨寨贵州烤锅（鞍山店）", "王五", "13700137003", "辽宁省鞍山市铁东区站前街18号"],
  ["黎明屯铁锅炖（海口龙湖天街店）", "赵六", "13600136004", "海南省海口市龙华区南海大道15号"],
];

const skus = [
  ["SKU-1001", "成品锅包肉(含汁)", "1kg*10袋*箱"],
  ["SKU-1002", "大花工帽鸭舌帽", "1*1顶"],
  ["SKU-1003", "牛肉卷", "500g*20袋"],
  ["SKU-1004", "菌菇拼盘", "300g*12盒"],
  ["SKU-1005", "酸汤锅底", "2kg*6袋"],
];

function standardRows(count, options = {}) {
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const store = stores[index % stores.length];
    const sku = skus[index % skus.length];
    const orderNo = options.sameOrderEveryTwo ? Math.floor(index / 2) + 1 : index + 1;
    rows.push([
      `${options.prefix ?? "ORD"}-${String(orderNo).padStart(5, "0")}`,
      store[0],
      store[1],
      store[2],
      store[3],
      sku[0],
      sku[1],
      (index % 9) + 1,
      sku[2],
      index % 3 === 0 ? "加急配送" : "",
    ]);
  }
  return rows;
}

const v2Headers = [
  "外部编码",
  "收货门店",
  "收件人姓名",
  "收件人电话",
  "收件人地址",
  "SKU物品编码",
  "SKU物品名称",
  "SKU发货数量",
  "SKU规格型号",
  "备注",
];

writeBook("v2-case01-standard-sku-table.xlsx", [
  {
    name: "出库单导入",
    data: [v2Headers, ...standardRows(12, { prefix: "STD" })],
  },
]);

writeBook("v2-case02-tail-receiver-info.xlsx", [
  {
    name: "Sheet0",
    data: [
      ["黎明屯铁锅炖配送中心-配送发货单PS2512220005001"],
      ["收货机构", "黎明屯铁锅炖（海口龙湖天街店）", "供货机构", "黎明屯铁锅炖配送中心"],
      ["发货操作时间", "2025/12/23 09:00:00", "单据状态", "待发货"],
      ["序号", "物品分类", "物品编码", "物品名称", "规格型号", "订货数量", "发货数量", "备注"],
      ["1", "食材", "LMTZ0160009", "成品锅包肉(含汁)", "1kg*10袋*箱", "20", "20", ""],
      ["2", "工服", "LMTZ1040002", "大花工帽鸭舌帽", "1*1顶", "10", "10", ""],
      ["合计", "", "", "", "", "30", "30", ""],
      ["单据号", "PS2512220005001", "上游单据", "DH2512220006"],
      ["收货人", "张锦峰", "", "收货电话", "18533660999", "", "收货地址", "海南省海口市龙华区南海大道15号龙湖海口天街"],
      ["备注", "尾部收货信息测试"],
    ],
  },
]);

writeBook("v2-case03-multi-sheet-store-orders.xlsx", [
  {
    name: "尹三顺银泰店",
    data: [
      ["SKU物品编码", "SKU物品名称", "SKU发货数量", "SKU规格型号", "备注"],
      ["SKU-2001", "五花肉", 8, "400g*20袋", ""],
      ["SKU-2002", "蘸料", 12, "100g*60包", ""],
    ],
  },
  {
    name: "欢乐牧场龙湖店",
    data: [
      ["SKU物品编码", "SKU物品名称", "SKU发货数量", "SKU规格型号", "备注"],
      ["SKU-3001", "牛排", 6, "200g*30袋", ""],
      ["SKU-3002", "玉米粒", 10, "1kg*10袋", ""],
    ],
  },
  {
    name: "黔寨寨鞍山店",
    data: [
      ["SKU物品编码", "SKU物品名称", "SKU发货数量", "SKU规格型号", "备注"],
      ["SKU-4001", "酸汤", 5, "2kg*6袋", ""],
      ["SKU-4002", "腊肉", 7, "500g*20袋", ""],
    ],
  },
]);

writeBook("v2-case04-matrix-store-by-sku.xlsx", [
  {
    name: "矩阵配送",
    data: [
      ["SKU物品编码", "SKU物品名称", "SKU规格型号", "尹三顺银泰店", "欢乐牧场龙湖店", "黔寨寨鞍山店"],
      ["SKU-5001", "牛肉卷", "500g*20袋", 5, 8, 4],
      ["SKU-5002", "菌菇拼盘", "300g*12盒", 3, 6, 2],
      ["SKU-5003", "酸汤锅底", "2kg*6袋", 4, "", 7],
    ],
  },
]);

writeBook("v2-case05-card-list-transfer.xlsx", [
  {
    name: "卡片式调拨",
    data: [
      ["▶ 调拨记录 #1"],
      ["门店：尹三顺自助烤肉（银泰店）", "电话：13800138001", "地址：浙江省杭州市拱墅区延安路530号银泰A座"],
      ["编码", "名称", "规格", "数量"],
      ["SKU-6001", "锅底", "2kg*6袋", 4],
      ["SKU-6002", "蘸料", "100g*60包", 10],
      [],
      ["▶ 调拨记录 #2"],
      ["门店：欢乐牧场（龙湖天街店）", "电话：13900139002", "地址：重庆市渝北区龙湖天街6号"],
      ["编码", "名称", "规格", "数量"],
      ["SKU-6003", "牛肉卷", "500g*20袋", 8],
      ["SKU-6004", "菌菇拼盘", "300g*12盒", 6],
    ],
  },
]);

writeBook("v2-case06-validation-errors.xlsx", [
  {
    name: "错误样例",
    data: [
      v2Headers,
      ["ERR-00001", "", "", "", "", "SKU-7001", "缺收货信息", 2, "1kg", ""],
      ["ERR-00002", "错误门店", "", "12345", "", "", "缺SKU编码", 3, "1kg", ""],
      ["ERR-00003", "错误门店", "", "", "", "SKU-7003", "", 4, "1kg", ""],
      ["ERR-00004", "错误门店", "", "", "", "SKU-7004", "数量为0", 0, "1kg", ""],
      ["ERR-00005", "错误门店", "", "", "", "SKU-7005", "数量非数字", "abc", "1kg", ""],
    ],
  },
]);

writeBook("v2-case07-duplicate-external-code.xlsx", [
  {
    name: "重复外部编码",
    data: [
      v2Headers,
      ...standardRows(2, { prefix: "DUP", sameOrderEveryTwo: true }),
      ...standardRows(4, { prefix: "DUP" }).map((row, index) => (index < 2 ? ["DUP-00099", ...row.slice(1)] : row)),
    ],
  },
]);

writeBook("v2-case08-large-1000-sku-rows.xlsx", [
  {
    name: "1000条性能测试",
    data: [v2Headers, ...standardRows(1000, { prefix: "PERF" })],
  },
]);

writeBook("v2-case09-large-1000-sku-grouped-orders.xlsx", [
  {
    name: "1000条聚合性能",
    data: [v2Headers, ...standardRows(1000, { prefix: "GRP", sameOrderEveryTwo: true })],
  },
]);

const files = fs.readdirSync(outDir).sort();
console.log(`Generated ${files.length} V2 test files in ${outDir}`);
for (const file of files) {
  const stat = fs.statSync(path.join(outDir, file));
  console.log(`${file}\t${stat.size} bytes`);
}
