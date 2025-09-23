import express from "express";
import db from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendOrderEmail } from "../utils/email.js";

const router = express.Router();

// ---------------- CREATE ORDER ----------------
const createOrderHandler = async (req, res) => {
  try {
    const cartResult = await db.query(
      `SELECT ci.id, ci.quantity, p.id AS product_id, p.price, p.name
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );

    if (!cartResult.rows.length) return res.status(400).json({ error: "Cart is empty" });

    const itemsForEmail = cartResult.rows.map(i => ({
      product_id: i.product_id,
      name: i.name,
      quantity: Number(i.quantity),
      price: Number(i.price),
    }));

    const subtotal = itemsForEmail.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = 0;
    const total = subtotal + shipping;

    const orderResult = await db.query(
      `INSERT INTO orders (user_id, total, status, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id`,
      [req.user.id, total, "pending"]
    );

    const orderId = orderResult.rows[0].id;

    for (const item of itemsForEmail) {
      await db.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, item.price]
      );
    }

    await db.query("DELETE FROM cart_items WHERE user_id = $1", [req.user.id]);

    const userName = req.user.name?.trim() || req.user.email || "Customer";
    const adminEmail = process.env.ADMIN_EMAIL?.trim();

    // User email
    await sendOrderEmail(req.user.email, {
      orderId,
      total,
      items: itemsForEmail,
      status: "Pending",
      paymentMethod: "COD",
      message: `Dear ${userName}, your order #${String(orderId).padStart(6, "0")} has been successfully placed.`
    });

    // Admin email
    if (adminEmail) {
      await sendOrderEmail(adminEmail, {
        orderId,
        total,
        items: itemsForEmail,
        status: "Pending",
        paymentMethod: "COD",
        message: `New order placed by ${userName} (${req.user.email}) - Order #${String(orderId).padStart(6, "0")}.`
      });
    }

    res.json({ order: { id: orderId, subtotal, shipping, total, status: "pending" } });
  } catch (err) {
    console.error("Order creation error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

router.post("/", authMiddleware, createOrderHandler);
router.post("/create", authMiddleware, createOrderHandler);

// ---------------- GET ORDERS ----------------
router.get("/", authMiddleware, async (req, res) => {
  try {
    const ordersResult = await db.query(
      `SELECT o.id, o.total AS total, 0 AS shipping, o.total AS subtotal, o.status, o.created_at
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

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const orderResult = await db.query(
      `SELECT id, total AS total, 0 AS shipping, total AS subtotal, status, created_at
       FROM orders
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (!orderResult.rows.length) return res.status(404).json({ error: "Order not found" });

    const itemsResult = await db.query(
      `SELECT oi.id, oi.quantity, oi.price, p.name, p.image_url
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [id]
    );

    res.json({ order: orderResult.rows[0], items: itemsResult.rows });
  } catch (err) {
    console.error("Get order error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------- CANCEL ORDER ----------------
router.patch("/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const orderResult = await db.query(
      `SELECT id, status, total FROM orders WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (!orderResult.rows.length) return res.status(404).json({ error: "Order not found" });

    const order = orderResult.rows[0];
    if (order.status !== "pending") return res.status(400).json({ error: "Only pending orders can be cancelled" });

    await db.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [id]);

    const itemsResult = await db.query(
      `SELECT oi.id, oi.quantity, oi.price, p.name
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [id]
    );

    const itemsForEmail = itemsResult.rows.map(i => ({
      name: i.name,
      quantity: Number(i.quantity),
      price: Number(i.price),
    }));

    const adminEmail = process.env.ADMIN_EMAIL?.trim();

    if (adminEmail) {
      try {
        await sendOrderEmail(adminEmail, {
          orderId: id,
          total: Number(order.total),
          items: itemsForEmail,
          status: "Cancelled",
          paymentMethod: "COD",
          message: `User ${req.user.name || req.user.email} has cancelled order #${String(id).padStart(6, "0")}.`
        });
      } catch (err) {
        console.error("Admin email send failed:", err);
      }
    }

    res.json({ message: "Order cancelled successfully", orderId: id });
  } catch (err) {
    console.error("Cancel order error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
