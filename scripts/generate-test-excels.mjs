import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const outDir = path.resolve("test-excels");
fs.mkdirSync(outDir, { recursive: true });

const rows = [
  ["TST-001", "张三", "13800138001", "北京市朝阳区建国路88号", "李四", "13900139001", "上海市浦东新区陆家嘴路100号", 5.2, 2, "常温", "易碎品"],
  ["TST-002", "王五", "13800138002", "广州市天河区体育西路66号", "赵六", "13900139002", "深圳市南山区科技路200号", 3, 1, "冷藏", ""],
  ["TST-003", "孙七", "13800138003", "成都市武侯区人民南路50号", "周八", "13900139003", "重庆市渝中区解放碑步行街1号", 10.5, 5, "冷冻", "加急"],
  ["", "钱九", "13800138004", "杭州市西湖区文三路20号", "吴十", "13900139004", "南京市鼓楼区中山路300号", 1.5, 1, "常温", "无外部编码"],
  ["TST-004", "郑十一", "13800138005", "武汉市江汉区江汉路150号", "冯十二", "13900139005", "长沙市岳麓区麓山路88号", 8, 3, "冷冻", ""],
];

function writeBook(fileName, sheets) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
    if (sheet.merges) worksheet["!merges"] = sheet.merges;
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  XLSX.writeFile(workbook, path.join(outDir, fileName));
}

writeBook("case1-standard-header-row1.xlsx", [
  {
    name: "订单导入",
    data: [
      ["外部编码", "发件人姓名", "发件人电话", "发件人地址", "收件人姓名", "收件人电话", "收件人地址", "重量(kg)", "件数", "温层", "备注"],
      ...rows,
    ],
  },
]);

writeBook("case2-ecommerce-title-merged.xlsx", [
  {
    name: "Sheet1",
    data: [
      ["电商平台冷链订单导入模板", null, null, null, null, null, null, null, null, null, null],
      ["说明：红色字段必填，温层只能填写常温/冷藏/冷冻", null, null, null, null, null, null, null, null, null, null],
      ["外部订单号", "发货人", "发货电话", "发货地址", "收货人", "收货电话", "收货地址", "重量(kg)", "数量", "温度要求", "附言"],
      ...rows,
    ],
    merges: [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
    ],
  },
]);

writeBook("case3-english-reordered.xlsx", [
  {
    name: "Import",
    data: [
      ["Temp Zone", "Qty", "Weight(kg)", "Receiver", "Receiver Tel", "Receiver Address", "Sender", "Sender Tel", "Sender Address", "Ref Code", "Note"],
      [],
      ...rows.map((row) => [row[9], row[8], row[7], row[4], row[5], row[6], row[1], row[2], row[3], row[0], row[10]]),
    ],
  },
]);

writeBook("case4-grouped-two-level.xlsx", [
  {
    name: "批量下单",
    data: [
      ["发件方信息", null, null, null, "收件方信息", null, null, null, "货物信息", null, null],
      ["发件人", "发件电话", "发件地址", "外部编码", "收件人", "收件电话", "收件地址", "备注", "重量(kg)", "件数", "温层"],
      ...rows.map((row) => [row[1], row[2], row[3], row[0], row[4], row[5], row[6], row[10], row[7], row[8], row[9]]),
    ],
    merges: [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 0, c: 4 }, e: { r: 0, c: 7 } },
      { s: { r: 0, c: 8 }, e: { r: 0, c: 10 } },
    ],
  },
]);

const splitRows = rows.map((row) => [
  row[1],
  row[2],
  "浙江省",
  "杭州市",
  "西湖区",
  `测试发件地址${row[0] || "NO-CODE"}`,
  row[4],
  row[5],
  "江苏省",
  "南京市",
  "鼓楼区",
  `测试收件地址${row[0] || "NO-CODE"}`,
  row[7],
  row[8],
  row[9],
]);

const bigRows = Array.from({ length: 1005 }, (_, index) => {
  const base = rows[index % rows.length];
  const seq = String(index + 1).padStart(4, "0");
  return [
    `BIG-${seq}`,
    `${base[1]}-${seq}`,
    base[2],
    `${base[3]}-${seq}`,
    `${base[4]}-${seq}`,
    base[5],
    `${base[6]}-${seq}`,
    base[7],
    base[8],
    base[9],
    `大文件第 ${seq} 行`,
  ];
});

writeBook("case5-multisheet-split-address-missing-optional.xlsx", [
  {
    name: "填写说明",
    data: [
      ["批量下单导入模板 - 使用说明"],
      ["本模板无外部编码和备注列，地址被拆分为省/市/区/详细地址。"],
      ["系统应自动选择“订单数据”Sheet，并组合收发件地址。"],
    ],
  },
  {
    name: "订单数据",
    data: [
      ["寄件人", "寄件电话", "寄件省", "寄件市", "寄件区", "寄件详细地址", "收方", "收件电话", "收件省", "收件市", "收件区", "收件详细地址", "重量(KG)", "包裹数量", "温层"],
      ...splitRows,
    ],
  },
]);

writeBook("case6-large-1005-rows.xlsx", [
  {
    name: "大批量订单",
    data: [
      ["外部编码", "发件人姓名", "发件人电话", "发件人地址", "收件人姓名", "收件人电话", "收件人地址", "重量(kg)", "件数", "温层", "备注"],
      ...bigRows,
    ],
  },
]);

writeBook("case7-similar-memory-template.xlsx", [
  {
    name: "相似模板",
    data: [
      ["导入批次：模板记忆相似结构验证"],
      ["外部编码", "发件人姓名", "发件人电话", "发件人地址", "收件人姓名", "收件人电话", "收件人地址", "重量(kg)", "件数", "温层", "客户备注"],
      ...rows.map((row) => row),
    ],
  },
]);

console.log(`Generated ${fs.readdirSync(outDir).length} files:`);
for (const file of fs.readdirSync(outDir)) {
  console.log(path.join(outDir, file));
}
