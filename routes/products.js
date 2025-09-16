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
  // Convert price to number for each product
  const products = result.rows.map(p => ({ ...p, price: p.price ? Number(p.price) : 0 }));
  return res.json({ products });
    } else {
      const result = await db.query("SELECT * FROM products ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
  const products = result.rows.map(p => ({ ...p, price: p.price ? Number(p.price) : 0 }));
  return res.json({ products });
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
  // Convert price to number
  const product = { ...result.rows[0], price: result.rows[0].price ? Number(result.rows[0].price) : 0 };
  res.json({ product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
