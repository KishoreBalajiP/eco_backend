// routes/payments.js
import express from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import db from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Setup Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * POST /api/payments/create-order
 * body: { orderId }
 * Creates a Razorpay order for an existing order in DB
 */
router.post("/create-order", authMiddleware, async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: "orderId required" });

  try {
    // Fetch order
    const orderRes = await db.query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [orderId, req.user.id]
    );
    if (!orderRes.rows.length)
      return res.status(404).json({ error: "Order not found" });

    const order = orderRes.rows[0];
    const amount = Math.round(parseFloat(order.total) * 100); // Razorpay expects paise

    const options = {
      amount,
      currency: "INR",
      receipt: `order_rcptid_${orderId}`,
      payment_capture: 1,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Save razorpay_order_id in DB
    await db.query(
      "UPDATE orders SET razorpay_order_id = $1 WHERE id = $2",
      [razorpayOrder.id, orderId]
    );

    res.json({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
    });
  } catch (err) {
    console.error("Error creating Razorpay order:", err);
    res.status(500).json({ error: "Failed to create Razorpay order" });
  }
});

/**
 * POST /api/payments/verify
 * body: { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Verifies signature and updates order status
 */
router.post("/verify", authMiddleware, async (req, res) => {
  const {
    orderId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    // Update order as paid
    await db.query(
      "UPDATE orders SET status = $1, razorpay_payment_id = $2 WHERE id = $3",
      ["paid", razorpay_payment_id, orderId]
    );

    res.json({ success: true, message: "Payment verified and order updated" });
  } catch (err) {
    console.error("Payment verification error:", err);
    res.status(500).json({ error: "Verification failed" });
  }
});

export default router;
