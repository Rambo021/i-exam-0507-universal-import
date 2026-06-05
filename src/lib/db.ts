import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { ShipmentRow } from "./types";
import { ParseRule, validateRule } from "./rules/schema";

const connectionString = process.env.DATABASE_URL;

export function hasDatabase() {
  return Boolean(connectionString);
}

function getSql() {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  return neon(connectionString);
}

export async function ensureSchema() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS parse_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      file_types JSONB NOT NULL,
      rule_json JSONB NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      rule_id TEXT,
      file_name TEXT,
      status TEXT NOT NULL DEFAULT 'done',
      total_count INTEGER NOT NULL,
      success_count INTEGER NOT NULL,
      failed_count INTEGER NOT NULL,
      parse_duration_ms INTEGER,
      render_duration_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS shipment_orders (
      id TEXT PRIMARY KEY,
      external_code TEXT,
      store_name TEXT,
      receiver_name TEXT,
      receiver_phone TEXT,
      receiver_address TEXT,
      remark TEXT,
      import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS shipment_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES shipment_orders(id) ON DELETE CASCADE,
      sku_code TEXT NOT NULL,
      sku_name TEXT NOT NULL,
      quantity NUMERIC NOT NULL,
      spec TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_shipment_orders_external_code ON shipment_orders(external_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_shipment_orders_receiver_name ON shipment_orders(receiver_name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_shipment_orders_created_at ON shipment_orders(created_at)`;
  // migrations for tables created before V2 schema
  await sql`ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS rule_id TEXT`;
  await sql`ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS file_name TEXT`;
  await sql`ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done'`;
  await sql`ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS parse_duration_ms INTEGER`;
  await sql`ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS render_duration_ms INTEGER`;
}

export async function listRules() {
  await ensureSchema();
  const sql = getSql();
  return sql`
    SELECT
      id,
      name,
      description,
      file_types AS "fileTypes",
      rule_json AS "ruleJson",
      version,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM parse_rules
    WHERE deleted_at IS NULL
    ORDER BY updated_at DESC
  `;
}

export async function getRule(id: string) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT rule_json AS "ruleJson"
    FROM parse_rules
    WHERE id = ${id} AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0]?.ruleJson as ParseRule | undefined;
}

export async function upsertRule(input: unknown) {
  await ensureSchema();
  const sql = getSql();
  const rule = validateRule(input);
  await sql`
    INSERT INTO parse_rules (id, name, description, file_types, rule_json, version)
    VALUES (${rule.id}, ${rule.name}, ${rule.description}, ${JSON.stringify(rule.fileTypes)}, ${JSON.stringify(rule)}, ${rule.version})
    ON CONFLICT (id)
    DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      file_types = EXCLUDED.file_types,
      rule_json = EXCLUDED.rule_json,
      version = EXCLUDED.version,
      deleted_at = NULL,
      updated_at = NOW()
  `;
  return rule;
}

export async function softDeleteRule(id: string) {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE parse_rules SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${id}`;
}

export async function findDuplicateExternalCodes(codes: string[]) {
  await ensureSchema();
  const sql = getSql();
  const cleanCodes = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));
  if (!cleanCodes.length) return new Set<string>();

  const rows = (await sql`
    SELECT external_code
    FROM shipment_orders
    WHERE external_code = ANY(${cleanCodes})
  `) as { external_code: string }[];
  return new Set(rows.map((row) => row.external_code));
}

function orderKey(row: ShipmentRow) {
  return row.orderKey || row.externalCode.trim() || `${row.storeName}|${row.receiverName}|${row.receiverPhone}|${row.receiverAddress}|${row.remark}`;
}

export async function importShipments(params: {
  rows: ShipmentRow[];
  ruleId?: string;
  fileName?: string;
  parseDurationMs?: number;
  renderDurationMs?: number;
}) {
  await ensureSchema();
  const sql = getSql();
  const batchId = nanoid(12);
  await sql`
    INSERT INTO import_batches (
      id,
      rule_id,
      file_name,
      status,
      total_count,
      success_count,
      failed_count,
      parse_duration_ms,
      render_duration_ms
    )
    VALUES (
      ${batchId},
      ${params.ruleId ?? null},
      ${params.fileName ?? null},
      'processing',
      ${params.rows.length},
      0,
      0,
      ${params.parseDurationMs ?? null},
      ${params.renderDurationMs ?? null}
    )
  `;

  const grouped = new Map<string, ShipmentRow[]>();
  params.rows.forEach((row) => {
    const key = orderKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });

  let successCount = 0;
  for (const rows of grouped.values()) {
    const first = rows[0];
    const orderId = nanoid(12);
    await sql`
      INSERT INTO shipment_orders (
        id,
        external_code,
        store_name,
        receiver_name,
        receiver_phone,
        receiver_address,
        remark,
        import_batch_id
      )
      VALUES (
        ${orderId},
        ${first.externalCode.trim() || null},
        ${first.storeName.trim() || null},
        ${first.receiverName.trim() || null},
        ${first.receiverPhone.trim() || null},
        ${first.receiverAddress.trim() || null},
        ${first.remark.trim() || null},
        ${batchId}
      )
    `;
    for (const row of rows) {
      await sql`
        INSERT INTO shipment_items (id, order_id, sku_code, sku_name, quantity, spec)
        VALUES (${nanoid(12)}, ${orderId}, ${row.skuCode.trim()}, ${row.skuName.trim()}, ${Number(row.quantity)}, ${row.spec.trim() || null})
      `;
      successCount += 1;
    }
  }

  await sql`
    UPDATE import_batches
    SET status = 'done', success_count = ${successCount}, failed_count = ${params.rows.length - successCount}
    WHERE id = ${batchId}
  `;

  return { batchId, successCount, failedCount: params.rows.length - successCount };
}

export async function queryShipmentRows(params: {
  externalCode?: string;
  receiverName?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}) {
  await ensureSchema();
  const sql = getSql();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
  const offset = (page - 1) * pageSize;
  const externalCode = `%${params.externalCode ?? ""}%`;
  const receiverName = `%${params.receiverName ?? ""}%`;
  const startDate = params.startDate ? new Date(params.startDate).toISOString() : "1970-01-01T00:00:00.000Z";
  const endDate = params.endDate ? new Date(`${params.endDate}T23:59:59`).toISOString() : "2999-12-31T23:59:59.000Z";

  const rows = await sql`
    SELECT
      so.id AS "orderId",
      si.id AS "itemId",
      COALESCE(so.external_code, '') AS "externalCode",
      COALESCE(so.store_name, '') AS "storeName",
      COALESCE(so.receiver_name, '') AS "receiverName",
      COALESCE(so.receiver_phone, '') AS "receiverPhone",
      COALESCE(so.receiver_address, '') AS "receiverAddress",
      si.sku_code AS "skuCode",
      si.sku_name AS "skuName",
      si.quantity::TEXT AS quantity,
      COALESCE(si.spec, '') AS spec,
      COALESCE(so.remark, '') AS remark,
      so.import_batch_id AS "importBatchId",
      so.created_at AS "createdAt"
    FROM shipment_orders so
    JOIN shipment_items si ON si.order_id = so.id
    WHERE COALESCE(so.external_code, '') ILIKE ${externalCode}
      AND COALESCE(so.receiver_name, '') ILIKE ${receiverName}
      AND so.created_at BETWEEN ${startDate}::timestamptz AND ${endDate}::timestamptz
    ORDER BY so.created_at DESC, so.id DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  const countRows = await sql`
    SELECT COUNT(*)::INTEGER AS total
    FROM shipment_orders so
    JOIN shipment_items si ON si.order_id = so.id
    WHERE COALESCE(so.external_code, '') ILIKE ${externalCode}
      AND COALESCE(so.receiver_name, '') ILIKE ${receiverName}
      AND so.created_at BETWEEN ${startDate}::timestamptz AND ${endDate}::timestamptz
  `;

  return {
    rows,
    total: Number(countRows[0]?.total ?? 0),
    page,
    pageSize,
  };
}
