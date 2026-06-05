# V2 测试文件说明

本目录由以下命令生成：

```bash
npm run generate:v2-tests
```

## 文件列表

| 文件 | 用途 |
| --- | --- |
| `v2-case01-standard-sku-table.xlsx` | 标准 V2 SKU 明细表，表头第 1 行 |
| `v2-case02-tail-receiver-info.xlsx` | 类真实配送发货单：表格中只有 SKU，收货人/电话/地址/单据号在尾部信息区 |
| `v2-case03-multi-sheet-store-orders.xlsx` | 多 Sheet，每个 Sheet 一个门店 |
| `v2-case04-matrix-store-by-sku.xlsx` | SKU x 门店矩阵转置测试 |
| `v2-case05-card-list-transfer.xlsx` | 卡片式调拨记录测试 |
| `v2-case06-validation-errors.xlsx` | 校验错误测试：缺收货信息、缺 SKU、数量错误等 |
| `v2-case07-duplicate-external-code.xlsx` | 批内外部编码重复测试 |
| `v2-case08-large-1000-sku-rows.xlsx` | 1000 条 SKU 明细性能测试，每行一个外部编码 |
| `v2-case09-large-1000-sku-grouped-orders.xlsx` | 1000 条 SKU 明细性能测试，每两行聚合为同一个外部编码 |

## 建议测试方式

1. 打开首页。
2. 上传目标文件。
3. 点击“新建规则 / AI 生成”。
4. 检查规则 JSON，必要时微调。
5. 点击“保存当前规则”。
6. 点击“执行解析”。
7. 检查预览列表、错误面板和导出功能。

性能测试优先使用：

- `v2-case08-large-1000-sku-rows.xlsx`
- `v2-case09-large-1000-sku-grouped-orders.xlsx`
