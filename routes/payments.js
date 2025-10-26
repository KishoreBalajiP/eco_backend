// routes/payments.js
import express from "express";
import crypto from "crypto";
import db from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// ---------------- CREATE PHONEPE ORDER ----------------
router.post("/create-phonepe-order", authMiddleware, async (req, res) => {
  const { orderId, amount } = req.body;

  if (!orderId || !amount)
    return res.status(400).json({ error: "orderId and amount required" });

  try {
    // Fetch order from DB to ensure it belongs to user
    const orderRes = await db.query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [orderId, req.user.id]
    );

    if (!orderRes.rows.length)
      return res.status(404).json({ error: "Order not found" });

    const amountPaise = Math.round(parseFloat(amount) * 100); // PhonePe expects paise

    // Create payload for PhonePe Standard Checkout
    const payload = {
      merchantId: process.env.PHONEPE_MERCHANT_ID,
      merchantOrderId: orderId,
      amount: amountPaise,
      redirectUrl: "https://yourwebsite.com/payment-callback", // Replace with your callback URL
    };

    // HMAC SHA256 signature
    const signature = crypto
      .createHmac("sha256", process.env.PHONEPE_SECRET_KEY)
      .update(JSON.stringify(payload))
      .digest("hex");

    // Save phonepe_order_id in DB
    await db.query(
      "UPDATE orders SET phonepe_order_id = $1 WHERE id = $2",
      [orderId, orderId]
    );

    // Send HTML form that auto-submits to PhonePe
    const htmlForm = `
      <html>
        <body onload="document.forms[0].submit()">
          <form action="${payload.redirectUrl}" method="POST">
            <input type="hidden" name="merchantId" value="${payload.merchantId}" />
            <input type="hidden" name="paymentId" value="${orderId}" />
            <input type="hidden" name="amount" value="${amountPaise}" />
            <input type="hidden" name="signature" value="${signature}" />
          </form>
          <p>Redirecting to PhonePe...</p>
        </body>
      </html>
    `;

    res.send(htmlForm);

  } catch (err) {
    console.error("Error creating PhonePe order:", err);
    res.status(500).json({ error: "Failed to create PhonePe order" });
  }
});

// ---------------- PHONEPE WEBHOOK ----------------
router.post("/phonepe-webhook", async (req, res) => {
  try {
    const body = req.body;
    const signature = req.headers["x-phonepe-signature"];

    // Verify HMAC SHA256 signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.PHONEPE_SECRET_KEY)
      .update(JSON.stringify(body))
      .digest("hex");

    if (generatedSignature !== signature) {
      console.warn("Invalid PhonePe signature", { received: signature, expected: generatedSignature });
      return res.status(400).send("Invalid signature");
    }

    // Update order status
    const { merchantOrderId, paymentId, status } = body;
    const paymentStatus = status === "SUCCESS" ? "paid" : "failed";

    await db.query(
      "UPDATE orders SET status = $1, phonepe_payment_id = $2 WHERE id = $3",
      [paymentStatus, paymentId, merchantOrderId]
    );

    res.status(200).send("OK");
  } catch (err) {
    console.error("PhonePe webhook error:", err);
    res.status(500).send("Internal server error");
  }
});

export default router;