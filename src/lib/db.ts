import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { OrderRow } from "./types";

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
    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      total_count INTEGER NOT NULL,
      success_count INTEGER NOT NULL,
      failed_count INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      external_code TEXT,
      sender_name TEXT NOT NULL,
      sender_phone TEXT NOT NULL,
      sender_address TEXT NOT NULL,
      receiver_name TEXT NOT NULL,
      receiver_phone TEXT NOT NULL,
      receiver_address TEXT NOT NULL,
      weight NUMERIC NOT NULL,
      quantity INTEGER NOT NULL,
      temperature_zone TEXT NOT NULL,
      remark TEXT,
      import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_receiver_name ON orders(receiver_name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`;
  await sql`
    CREATE TABLE IF NOT EXISTS template_mappings (
      id TEXT PRIMARY KEY,
      header_fingerprint TEXT NOT NULL UNIQUE,
      sheet_name TEXT NOT NULL,
      header_row_index INTEGER NOT NULL,
      mapping_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function findDuplicateExternalCodes(codes: string[]) {
  await ensureSchema();
  const sql = getSql();
  const cleanCodes = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));
  if (!cleanCodes.length) return new Set<string>();

  const rows = (await sql`
    SELECT external_code
    FROM orders
    WHERE external_code = ANY(${cleanCodes})
  `) as { external_code: string }[];
  return new Set(rows.map((row) => row.external_code));
}

export async function importOrders(rows: OrderRow[]) {
  await ensureSchema();
  const sql = getSql();
  const batchId = nanoid(12);
  await sql`
    INSERT INTO import_batches (id, total_count, success_count, failed_count)
    VALUES (${batchId}, ${rows.length}, ${rows.length}, 0)
  `;

  for (const row of rows) {
    await sql`
      INSERT INTO orders (
        id,
        external_code,
        sender_name,
        sender_phone,
        sender_address,
        receiver_name,
        receiver_phone,
        receiver_address,
        weight,
        quantity,
        temperature_zone,
        remark,
        import_batch_id
      )
      VALUES (
        ${nanoid(12)},
        ${row.externalCode.trim() || null},
        ${row.senderName.trim()},
        ${row.senderPhone.trim()},
        ${row.senderAddress.trim()},
        ${row.receiverName.trim()},
        ${row.receiverPhone.trim()},
        ${row.receiverAddress.trim()},
        ${Number(row.weight)},
        ${Number(row.quantity)},
        ${row.temperatureZone.trim()},
        ${row.remark.trim() || null},
        ${batchId}
      )
    `;
  }

  return { batchId, successCount: rows.length, failedCount: 0 };
}

export async function queryOrders(params: {
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
      id,
      COALESCE(external_code, '') AS "externalCode",
      sender_name AS "senderName",
      sender_phone AS "senderPhone",
      sender_address AS "senderAddress",
      receiver_name AS "receiverName",
      receiver_phone AS "receiverPhone",
      receiver_address AS "receiverAddress",
      weight::TEXT AS weight,
      quantity::TEXT AS quantity,
      temperature_zone AS "temperatureZone",
      COALESCE(remark, '') AS remark,
      import_batch_id AS "importBatchId",
      created_at AS "createdAt"
    FROM orders
    WHERE COALESCE(external_code, '') ILIKE ${externalCode}
      AND receiver_name ILIKE ${receiverName}
      AND created_at BETWEEN ${startDate}::timestamptz AND ${endDate}::timestamptz
    ORDER BY created_at DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  const countRows = await sql`
    SELECT COUNT(*)::INTEGER AS total
    FROM orders
    WHERE COALESCE(external_code, '') ILIKE ${externalCode}
      AND receiver_name ILIKE ${receiverName}
      AND created_at BETWEEN ${startDate}::timestamptz AND ${endDate}::timestamptz
  `;

  return {
    rows,
    total: Number(countRows[0]?.total ?? 0),
    page,
    pageSize,
  };
}

export async function upsertTemplateMapping(input: {
  fingerprint: string;
  sheetName: string;
  headerRowIndex: number;
  mapping: unknown;
}) {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO template_mappings (id, header_fingerprint, sheet_name, header_row_index, mapping_json)
    VALUES (${nanoid(12)}, ${input.fingerprint}, ${input.sheetName}, ${input.headerRowIndex}, ${JSON.stringify(input.mapping)})
    ON CONFLICT (header_fingerprint)
    DO UPDATE SET
      sheet_name = EXCLUDED.sheet_name,
      header_row_index = EXCLUDED.header_row_index,
      mapping_json = EXCLUDED.mapping_json,
      updated_at = NOW()
  `;
}
