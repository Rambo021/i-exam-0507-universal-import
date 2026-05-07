# 万能导入下单系统

面向物流批量下单场景的多模板 Excel 自动导入系统。支持模板自动识别、手动映射、模板记忆、类 Excel 预览编辑、实时校验、导出、提交入库和历史运单查询。

## 功能

- 支持 `.xlsx` / `.xls` 拖拽上传和点击上传。
- 自动识别题目附件中的 5 种模板：
  - 标准表头。
  - 电商说明行模板。
  - 英文字段模板。
  - 分组合并表头模板。
  - 多 Sheet 模板。
- 支持字段手动映射和模板记忆。
- 支持导入进度条，显示百分比和当前条数/总条数。
- 预览表格支持固定表头、横向滚动、单元格编辑、`Tab` / `Enter` 切换。
- 实时校验必填、电话、重量、件数、温层和外部编码重复。
- 一次性展示全部错误，明确到行号、字段名和原因。
- 支持新增行、删除行、导出当前预览数据为 Excel。
- 支持提交下单，写入 Neon PostgreSQL。
- 支持历史运单按外部编码、收件人姓名、提交时间筛选和分页。

## 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:3000`。

如果当前网络需要代理：

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
npm install
```

## 环境变量

复制 `.env.example` 为 `.env.local`，填写 Neon 连接串：

```bash
DATABASE_URL=postgresql://user:password@host/db?sslmode=require
```

未配置 `DATABASE_URL` 时，Excel 导入、预览、编辑、校验和导出仍可使用；提交入库和历史运单会提示数据库未配置。

## 构建验证

```bash
npm run lint
npm run build
```

## 需求文档

见 `docs/requirements-design.md`。
