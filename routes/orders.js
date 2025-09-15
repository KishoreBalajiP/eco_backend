// routes/orders.js
import express from "express";
import db from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendOrderEmail } from "../utils/email.js";

const router = express.Router();

/**
 * POST /api/orders/create
 * body: { shipping: { ... }, payment_method: "stripe", currency: "USD" }
 * This endpoint will:
 *  - get cart items
 *  - create order row
 *  - create order_items
 *  - clear cart
 *  - return order id (payment is handled separately in /payments)
 */
router.post("/create", authMiddleware, async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const cartRes = await client.query(
      `SELECT ci.product_id, ci.quantity, p.price FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.user_id = $1`,
      [req.user.id]
    );
    if (!cartRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Cart is empty" });
    }
    // compute total
    const total = cartRes.rows.reduce((s, r) => s + parseFloat(r.price) * r.quantity, 0);

    const orderRes = await client.query(
      "INSERT INTO orders (user_id, total, currency, status) VALUES ($1, $2, $3, $4) RETURNING id",
      [req.user.id, total.toFixed(2), req.body.currency || "USD", "pending"]
    );
    const orderId = orderRes.rows[0].id;

    for (const row of cartRes.rows) {
      await client.query(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)",
        [orderId, row.product_id, row.quantity, row.price]
      );
    }

    // clear cart
    await client.query("DELETE FROM cart_items WHERE user_id = $1", [req.user.id]);

    await client.query("COMMIT");

    // send order confirmation email (async, won't block)
    sendOrderEmail(req.user.email, { orderId, total });

    res.json({ orderId, total });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

/**
 * GET /api/orders/:id
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const orderRes = await db.query("SELECT * FROM orders WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    if (!orderRes.rows.length) return res.status(404).json({ error: "Order not found" });
    const itemsRes = await db.query("SELECT * FROM order_items WHERE order_id = $1", [req.params.id]);
    res.json({ order: orderRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/orders (list)
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const orders = await db.query("SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC", [req.user.id]);
    res.json({ orders: orders.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
