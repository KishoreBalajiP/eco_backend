import express from "express";
import crypto from "crypto";
import db from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendOrderEmail } from "../utils/email.js";

const router = express.Router();

// ---------------- CREATE PHONEPE ORDER ----------------
router.post("/create-phonepe-order", authMiddleware, async (req, res) => {
  const { orderId, amount } = req.body;

  if (!orderId || !amount) {
    return res.status(400).json({ error: "orderId and amount required" });
  }

  try {
    // Fetch order to ensure it belongs to user
    const orderRes = await db.query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [orderId, req.user.id]
    );

    if (!orderRes.rows.length) {
      return res.status(404).json({ error: "Order not found" });
    }

    const amountPaise = Math.round(parseFloat(amount) * 100);

    // PhonePe sandbox/production URL
    const phonepeUrl = process.env.PHONEPE_SANDBOX === "true"
      ? "https://sandbox-accept.money.phonepe.com/v3/standard/checkout"
      : "https://accept.money.phonepe.com/v3/standard/checkout";

    // Create payload for PhonePe Standard Checkout
    const payload = {
      merchantId: process.env.PHONEPE_MERCHANT_ID,
      merchantOrderId: orderId,
      amount: amountPaise,
      redirectUrl: `${process.env.FRONTEND_URL}/payment-callback?orderId=${orderId}`,
    };

    // Generate HMAC SHA256 signature
    const signature = crypto
      .createHmac("sha256", process.env.PHONEPE_SECRET_KEY)
      .update(JSON.stringify(payload))
      .digest("hex");

    // Save phonepe_order_id in DB (optional)
    await db.query(
      "UPDATE orders SET phonepe_order_id = $1 WHERE id = $2",
      [orderId, orderId]
    );

    // Send HTML form to redirect automatically to PhonePe
    const htmlForm = `
      <html>
        <body onload="document.forms[0].submit()">
          <form action="${phonepeUrl}" method="POST">
            <input type="hidden" name="merchantId" value="${payload.merchantId}" />
            <input type="hidden" name="merchantOrderId" value="${payload.merchantOrderId}" />
            <input type="hidden" name="amount" value="${payload.amount}" />
            <input type="hidden" name="redirectUrl" value="${payload.redirectUrl}" />
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

    const { merchantOrderId, paymentId, status } = body;
    const paymentStatus = status === "SUCCESS" ? "paid" : "failed";

    // Update order status in DB
    await db.query(
      "UPDATE orders SET status = $1, phonepe_payment_id = $2 WHERE id = $3",
      [paymentStatus, paymentId, merchantOrderId]
    );

    if (paymentStatus === "paid") {
      // Clear cart for the user
      const userRes = await db.query(
        "SELECT user_id FROM orders WHERE id = $1",
        [merchantOrderId]
      );
      const userId = userRes.rows[0]?.user_id;

      if (userId) {
        await db.query("DELETE FROM cart_items WHERE user_id = $1", [userId]);
      }

      // Fetch order items for email
      const orderItemsRes = await db.query(
        `SELECT oi.product_id, oi.quantity, oi.price, p.name
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [merchantOrderId]
      );

      const itemsForEmail = orderItemsRes.rows.map(i => ({
        product_id: i.product_id,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
      }));

      // Fetch user email
      const userEmailRes = await db.query(
        "SELECT email, name FROM users WHERE id = $1",
        [userId]
      );
      const user = userEmailRes.rows[0];
      const adminEmail = process.env.ADMIN_EMAIL?.trim();

      if (user?.email) {
        try {
          await sendOrderEmail(user.email, {
            orderId: merchantOrderId,
            total: itemsForEmail.reduce((sum, i) => sum + i.price * i.quantity, 0),
            items: itemsForEmail,
            status: "Paid",
            paymentMethod: "UPI",
            shipping: {}, // optionally fetch shipping info if needed
            message: `Dear ${user.name || "Customer"}, your order #${String(merchantOrderId).padStart(6,"0")} has been successfully paid.`,
          });

          if (adminEmail) {
            await sendOrderEmail(adminEmail, {
              orderId: merchantOrderId,
              total: itemsForEmail.reduce((sum, i) => sum + i.price * i.quantity, 0),
              items: itemsForEmail,
              status: "Paid",
              paymentMethod: "UPI",
              message: `New order paid by ${user.name || user.email} - Order #${String(merchantOrderId).padStart(6,"0")}.`,
            });
          }
        } catch (err) {
          console.error("Email sending failed:", err);
        }
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("PhonePe webhook error:", err);
    res.status(500).send("Internal server error");
  }
});

export default router;
