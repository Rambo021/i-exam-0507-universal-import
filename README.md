# 万能导入 V2

智能多格式批量下单系统。支持 Excel、Word、PDF 文件结构分析，通过规则引擎解析为出库单 SKU 明细，并支持 AI 辅助生成解析规则、规则管理、预览编辑、校验、导出、提交入库和历史查询。

## 功能

- 支持 `.xlsx` / `.xls` / `.docx` / `.pdf` 上传。
- 上传后手动选择已有规则，或通过 AI 生成新规则。
- 规则保存到服务端数据库；未配置数据库时使用浏览器本地规则兜底。
- 规则 DSL 覆盖标准表格、多 Sheet、矩阵转置、卡片式、文本块、PDF 文本块等模式。
- 预览表格支持固定表头、横向滚动、单元格编辑、Tab/Enter 切换、新增行、删除行。
- 校验 SKU 编码、SKU 名称、数量、收货门店/收件人信息二选一、电话格式、批内和历史外部编码重复。
- 支持导出当前预览数据为 Excel。
- 支持提交出库单到 Neon PostgreSQL，并在历史列表分页查询。

## 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:3000`。

## 环境变量

```bash
DATABASE_URL=postgresql://user:password@host/db?sslmode=require
AI_PROVIDER=openai
AI_API_KEY=...
AI_MODEL=gpt-4.1-mini
AI_BASE_URL=https://api.openai.com/v1
```

`DATABASE_URL` 未配置时，上传、AI 兜底规则、规则本地保存、解析、预览、校验、导出仍可使用；提交入库和历史列表会提示数据库未配置。

`AI_API_KEY` 未配置时，系统会根据文件结构生成一条可编辑的基础规则，用户仍可手动确认并保存。

## 验证

```bash
npm run lint
npm run build
```

## 文档

- V2 需求分析与计划：`docs/v2-requirements-plan.md`
- 旧 V1 设计文档：`docs/requirements-design.md`
