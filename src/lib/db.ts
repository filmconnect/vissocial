import pg from "pg";
import { config } from "./config";
const { Pool } = pg;
export const pool = new Pool({ connectionString: config.dbUrl });
export async function q<T=any>(text:string, params:any[]=[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
