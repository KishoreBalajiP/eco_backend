// routes/products.js
import express from "express";
import db from "../db.js";

const router = express.Router();

/**
 * GET /api/products
 * query: ?q=search&page=1&limit=20
 */
router.get("/", async (req, res) => {
  const { q, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    if (q) {
      const search = `%${q}%`;
      const result = await db.query(
        "SELECT * FROM products WHERE name ILIKE $1 OR description ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        [search, limit, offset]
      );
      return res.json({ products: result.rows });
    } else {
      const result = await db.query("SELECT * FROM products ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
      return res.json({ products: result.rows });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/products/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query("SELECT * FROM products WHERE id = $1", [id]);
    if (!result.rows.length) return res.status(404).json({ error: "Product not found" });
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
