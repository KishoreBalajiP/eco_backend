import express from "express";
import db from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendOrderEmail } from "../utils/email.js";

const router = express.Router();

// ---------------- CREATE ORDER ----------------
const createOrderHandler = async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const { paymentMethod } = req.body; // 'cod' or 'upi'

    // Fetch cart items
    const cartResult = await client.query(
      `SELECT ci.id, ci.quantity, p.id AS product_id, p.price, p.name, p.stock
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );

    if (!cartResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Cart is empty" });
    }

    const itemsForEmail = cartResult.rows.map(i => ({
      product_id: i.product_id,
      name: i.name,
      quantity: Number(i.quantity),
      price: Number(i.price),
    }));

    const subtotal = itemsForEmail.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = 0;
    const total = subtotal + shipping;

    // Fetch user shipping info
    const userResult = await client.query(
      `SELECT shipping_name, shipping_mobile, shipping_line1, shipping_line2,
              shipping_city, shipping_state, shipping_postal_code, shipping_country
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const userShipping = userResult.rows[0];

    if (
      !userShipping.shipping_name ||
      !userShipping.shipping_mobile ||
      !userShipping.shipping_line1 ||
      !userShipping.shipping_city ||
      !userShipping.shipping_state ||
      !userShipping.shipping_postal_code ||
      !userShipping.shipping_country
    ) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Please add your shipping address and mobile before placing an order." });
    }

    // Check stock availability
    for (const item of cartResult.rows) {
      if (item.stock < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient stock for product: ${item.name}` });
      }
    }

    // Insert order with payment_method (PhonePe fields NULL for now)
    const orderResult = await client.query(
      `INSERT INTO orders 
       (user_id, total, status, shipping_name, shipping_mobile, shipping_line1, shipping_line2, 
        shipping_city, shipping_state, shipping_postal_code, shipping_country, created_at, payment_method,
        phonepe_order_id, phonepe_payment_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12,$13,$14)
       RETURNING id`,
      [
        req.user.id,
        total,
        "pending",
        userShipping.shipping_name,
        userShipping.shipping_mobile,
        userShipping.shipping_line1,
        userShipping.shipping_line2,
        userShipping.shipping_city,
        userShipping.shipping_state,
        userShipping.shipping_postal_code,
        userShipping.shipping_country,
        paymentMethod || "cod",
        null, // phonepe_order_id
        null, // phonepe_payment_id
      ]
    );

    const orderId = orderResult.rows[0].id;

    // Insert order items and update stock
    for (const item of itemsForEmail) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
         VALUES ($1,$2,$3,$4)`,
        [orderId, item.product_id, item.quantity, item.price]
      );

      await client.query(
        `UPDATE products 
         SET stock = stock - $1
         WHERE id = $2`,
        [item.quantity, item.product_id]
      );
    }

    // Clear cart only for COD (UPI handled separately)
    if (paymentMethod === "cod") {
      await client.query("DELETE FROM cart_items WHERE user_id = $1", [req.user.id]);
    }

    await client.query('COMMIT');

    // Respond to frontend
    res.json({
      order: { id: orderId, subtotal, shipping, total, status: "pending" },
    });

    // Send emails asynchronously
    (async () => {
      try {
        const userName = req.user.name?.trim() || req.user.email || "Customer";
        const adminEmail = process.env.ADMIN_EMAIL?.trim();

        await sendOrderEmail(req.user.email, {
          orderId,
          total,
          items: itemsForEmail,
          status: "Pending",
          paymentMethod: paymentMethod || "COD",
          shipping: userShipping,
          message: `Dear ${userName}, your order #${String(orderId).padStart(6,"0")} has been successfully placed.`,
        });

        if (adminEmail) {
          await sendOrderEmail(adminEmail, {
            orderId,
            total,
            items: itemsForEmail,
            status: "Pending",
            paymentMethod: paymentMethod || "COD",
            shipping: userShipping,
            message: `New order placed by ${userName} (${req.user.email}) - Order #${String(orderId).padStart(6,"0")}.`,
          });
        }
      } catch (err) {
        console.error("Email sending failed:", err);
      }
    })();

  } catch (err) {
    console.error("Order creation error:", err);
    try { await client.query('ROLLBACK'); } catch(e){ console.error(e); }
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
};

router.post("/", authMiddleware, createOrderHandler);
router.post("/create", authMiddleware, createOrderHandler);

// ---------------- GET ORDERS ----------------
router.get("/", authMiddleware, async (req, res) => {
  try {
    const ordersResult = await db.query(
      `SELECT id, total AS total, status, created_at,
              shipping_name, shipping_mobile, shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country, payment_method
       FROM orders
       WHERE user_id = $1
       ORDER BY created_at DESC`,
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
      `SELECT id, total AS total, status, created_at,
              shipping_name, shipping_mobile, shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country, payment_method
       FROM orders
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (!orderResult.rows.length)
      return res.status(404).json({ error: "Order not found" });

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
    if (!orderResult.rows.length)
      return res.status(404).json({ error: "Order not found" });

    const order = orderResult.rows[0];
    if (order.status !== "pending")
      return res.status(400).json({ error: "Only pending orders can be cancelled" });

    await db.query(
      `UPDATE orders SET status = 'cancelled', cancelled_by = 'user' WHERE id = $1`,
      [id]
    );

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
          message: `User ${req.user.name || req.user.email} has cancelled order #${String(id).padStart(6, "0")}.`,
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
