import "dotenv/config";
import fs from "fs";
import path from "path";
import { pool } from "./db";

async function migrate() {
  await pool.query("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())");

  const dir = path.join(process.cwd(), "src/db/migrations");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

  const { rows } = await pool.query("SELECT name FROM _migrations");
  const applied = new Set(rows.map((r: any) => r.name));

  for (const f of files) {
    if (applied.has(f)) {
      console.log("Skip (already applied)", f);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO _migrations(name) VALUES ($1)", [f]);
    console.log("Applied", f);
  }

  console.log("Migrations complete.");
  process.exit(0);
}

const cmd = process.argv[2];
if (cmd === "migrate") migrate();
else { console.log("Usage: npm run migrate"); process.exit(1); }
