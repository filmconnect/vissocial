import "dotenv/config";
import fs from "fs";
import path from "path";
import { pool } from "./db";

async function migrate() {
  const dir = path.join(process.cwd(), "src/db/migrations");
  const files = fs.readdirSync(dir).filter(f=>f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir,f),"utf8");
    await pool.query(sql);
    console.log("Applied", f);
  }
  process.exit(0);
}
const cmd = process.argv[2];
if (cmd === "migrate") migrate();
else { console.log("Usage: npm run migrate"); process.exit(1); }
