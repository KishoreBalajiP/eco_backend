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
    let result;

    if (q) {
      const search = `%${q}%`;
      result = await db.query(
        "SELECT * FROM products WHERE name ILIKE $1 OR description ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        [search, limit, offset]
      );
    } else {
      result = await db.query(
        "SELECT * FROM products ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        [limit, offset]
      );
    }

    // Convert price to number and keep image_url
    const products = result.rows.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price ? Number(p.price) : 0,
      stock: p.stock,
      image_url: p.image_url,
      created_at: p.created_at
    }));

    res.json({ products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/products/:id
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query("SELECT * FROM products WHERE id = $1", [id]);

    if (!result.rows.length) return res.status(404).json({ error: "Product not found" });

    const product = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      price: result.rows[0].price ? Number(result.rows[0].price) : 0,
      stock: result.rows[0].stock,
      image_url: result.rows[0].image_url,
      created_at: result.rows[0].created_at
    };

    res.json({ product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
