// routes/orders.js
import express from "express";
import db from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/**
 * POST /api/orders
 * Creates a new order from the current user's cart
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    // Get cart items for user
    const cartResult = await db.query(
      `SELECT ci.id, ci.quantity, p.id AS product_id, p.price
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );

    if (cartResult.rows.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Calculate subtotal
    const subtotal = cartResult.rows.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0
    );

    const shipping = 0; // free shipping for now
    const total = subtotal + shipping;

    // Create order
    const orderResult = await db.query(
      `INSERT INTO orders (user_id, total_amount, status, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id`,
      [req.user.id, total, "pending"]
    );

    const orderId = orderResult.rows[0].id;

    // Insert order items
    for (const item of cartResult.rows) {
      await db.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, item.price]
      );
    }

    // Clear cart
    await db.query("DELETE FROM cart_items WHERE user_id = $1", [req.user.id]);

    res.json({
      order: { id: orderId, subtotal, shipping, total, status: "pending" },
    });
  } catch (err) {
    console.error("Order creation error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/orders
 * Get all orders for the logged-in user
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const ordersResult = await db.query(
      `SELECT o.id, 
              o.total_amount AS total, 
              0 AS shipping,
              o.total_amount AS subtotal,
              o.status, 
              o.created_at
       FROM orders o
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    res.json({ orders: ordersResult.rows });
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/orders/:id
 * Get order details
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Order
    const orderResult = await db.query(
      `SELECT id, 
              total_amount AS total, 
              0 AS shipping,
              total_amount AS subtotal,
              status, 
              created_at
       FROM orders
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Items
    const itemsResult = await db.query(
      `SELECT oi.id, oi.quantity, oi.price,
              p.name, p.image_url
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [id]
    );

    res.json({
      order: orderResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (err) {
    console.error("Get order error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
