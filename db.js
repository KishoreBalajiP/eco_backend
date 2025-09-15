// db.js
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // optionally add ssl: { rejectUnauthorized: false } for some hosts
});

export default {
  query: (text, params) => pool.query(text, params),
  pool
};