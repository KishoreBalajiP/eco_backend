import express from "express";
import Razorpay from "razorpay";
import { authMiddleware } from "../middleware/auth.js";
import pool from "../db.js";

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create Razorpay order
router.post("/create-order", authMiddleware, async (req, res) => {
  const { orderId, currency } = req.body; // currency like "INR"

  try {
    // Fetch order total from DB
    const orderResult = await pool.query(
      "SELECT total FROM orders WHERE id=$1 AND user_id=$2",
      [orderId, req.user.id]
    );
    if (orderResult.rows.length === 0)
      return res.status(404).json({ error: "Order not found" });

    const amount = orderResult.rows[0].total * 100; // amount in paise

    const options = {
      amount,
      currency,
      receipt: `order_rcptid_${orderId}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.json({
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create Razorpay order" });
  }
});

// Optional: Verify payment webhook (if you want server-side verification)
router.post("/verify", authMiddleware, async (req, res) => {
  // You can implement Razorpay payment signature verification here
  res.json({ ok: true });
});

export default router;