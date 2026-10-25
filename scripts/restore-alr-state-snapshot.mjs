import fs from "node:fs";
import { Client } from "pg";

const file = process.argv[2];
if (!file) {
  console.error("Usage: DATABASE_URL=... node scripts/restore-alr-state-snapshot.mjs <snapshot.json>");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must point to a separate, empty recovery database.");
  process.exit(2);
}

const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
if (snapshot?.format !== "ai-lead-rescue-postgres-logical-backup-v1") {
  throw new Error("Unsupported snapshot format; refusing to restore.");
}
if (snapshot.tableCount !== 1 || !Array.isArray(snapshot.tables) || snapshot.tables.length !== 1) {
  throw new Error("This recovery script only supports the current single-table AI Lead Rescue database. Use a native pg_dump archive for other schemas.");
}
const table = snapshot.tables[0];
if (table.schema !== "public" || table.name !== "alr_state" || table.rowCount !== 1 || !Array.isArray(table.rows) || table.rows.length !== 1) {
  throw new Error("Snapshot does not contain exactly one public.alr_state row; refusing to restore.");
}
const row = table.rows[0];
if (row.id !== 1 || !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
  throw new Error("Snapshot's alr_state payload is invalid; refusing to restore.");
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 15000
});

await client.connect();
try {
  await client.query("BEGIN");
  await client.query("CREATE TABLE IF NOT EXISTS public.alr_state (id integer PRIMARY KEY CHECK (id = 1), payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
  const existing = await client.query("SELECT count(*)::int AS count FROM public.alr_state");
  if (existing.rows[0].count !== 0) {
    throw new Error("Target public.alr_state is not empty. No data was changed; use a new recovery database.");
  }
  await client.query(
    "INSERT INTO public.alr_state (id, payload, updated_at) VALUES ($1, $2::jsonb, COALESCE($3::timestamptz, now()))",
    [row.id, JSON.stringify(row.payload), row.updated_at || null]
  );
  await client.query("COMMIT");
  console.log("Restore succeeded into the empty target database.");
  console.log("Restored table: public.alr_state");
  console.log("Payload keys:", Object.keys(row.payload).sort().join(", "));
  console.log("Source snapshot export time:", snapshot.exportedAt || "unknown");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
