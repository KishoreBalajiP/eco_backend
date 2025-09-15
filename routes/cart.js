// routes/cart.js
import express from "express";
import db from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /api/cart
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ci.id, ci.quantity, p.id as product_id, p.name, p.price, p.image_url
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );
    res.json({ cart: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/cart/add
 * body: { product_id, quantity }
 */
router.post("/add", authMiddleware, async (req, res) => {
  const { product_id, quantity = 1 } = req.body;
  try {
    // upsert
    await db.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
      [req.user.id, product_id, quantity]
    );
    const cart = await db.query(
      `SELECT ci.id, ci.quantity, p.id as product_id, p.name, p.price, p.image_url
       FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.user_id = $1`,
      [req.user.id]
    );
    res.json({ message: "Added to cart", cart: cart.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/cart/remove
 * body: { product_id }
 */
router.post("/remove", authMiddleware, async (req, res) => {
  const { product_id } = req.body;
  try {
    await db.query("DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2", [req.user.id, product_id]);
    const cart = await db.query(
      `SELECT ci.id, ci.quantity, p.id as product_id, p.name, p.price
       FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.user_id = $1`,
      [req.user.id]
    );
    res.json({ message: "Removed", cart: cart.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
