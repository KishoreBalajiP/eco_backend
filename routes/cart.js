// routes/cart.js
import express from "express";
import db from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/**
 * Helper to format cart items
 */
function formatCart(rows) {
  return rows.map(item => {
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;

    return {
      id: item.id,
      product_id: item.product_id,
      name: item.name,
      price, // flatten price
      quantity: qty,
      image_url: item.image_url || "",
      stock: item.stock ?? 0,
      subtotal: price * qty
    };
  });
}

/**
 * GET /api/cart
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ci.id, ci.quantity, p.id as product_id, p.name, p.price, p.image_url, p.stock
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );

    const cartItems = formatCart(result.rows);
    const totalAmount = cartItems.reduce((sum, i) => sum + i.subtotal, 0);
    const totalItems = cartItems.reduce((sum, i) => sum + i.quantity, 0);

    res.json({ cart: cartItems, totalItems, totalAmount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/cart/add
 */
router.post("/add", authMiddleware, async (req, res) => {
  const { product_id, quantity = 1 } = req.body;
  try {
    await db.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id) DO UPDATE
       SET quantity = cart_items.quantity + EXCLUDED.quantity`,
      [req.user.id, product_id, quantity]
    );

    const result = await db.query(
      `SELECT ci.id, ci.quantity, p.id as product_id, p.name, p.price, p.image_url, p.stock
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );

    const cartItems = formatCart(result.rows);
    const totalAmount = cartItems.reduce((sum, i) => sum + i.subtotal, 0);
    const totalItems = cartItems.reduce((sum, i) => sum + i.quantity, 0);

    res.json({ message: "Added to cart", cart: cartItems, totalItems, totalAmount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/cart/remove
 */
router.post("/remove", authMiddleware, async (req, res) => {
  const { product_id } = req.body;
  try {
    await db.query(
      `DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2`,
      [req.user.id, product_id]
    );

    const result = await db.query(
      `SELECT ci.id, ci.quantity, p.id as product_id, p.name, p.price, p.image_url, p.stock
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );

    const cartItems = formatCart(result.rows);
    const totalAmount = cartItems.reduce((sum, i) => sum + i.subtotal, 0);
    const totalItems = cartItems.reduce((sum, i) => sum + i.quantity, 0);

    res.json({ message: "Removed from cart", cart: cartItems, totalItems, totalAmount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
