import express from "express";
import crypto from "crypto";
import axios from "axios";
import db from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendOrderEmail } from "../utils/email.js";

const router = express.Router();

/**
 * ✅ CREATE PHONEPE ORDER (Frontend calls this when user chooses UPI)
 */
router.post("/create-phonepe-order", authMiddleware, async (req, res) => {
  const { orderId, amount } = req.body;

  if (!orderId || !amount) {
    return res.status(400).json({ error: "orderId and amount required" });
  }

  try {
    // 🔹 Ensure the order belongs to the logged-in user
    const orderRes = await db.query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [orderId, req.user.id]
    );
    if (!orderRes.rows.length) {
      return res.status(404).json({ error: "Order not found" });
    }

    const amountPaise = Math.round(parseFloat(amount) * 100);
    const isSandbox = process.env.PHONEPE_SANDBOX === "true";

    // ✅ Correct PhonePe API base URLs
    const baseUrl = isSandbox
      ? "https://api-preprod.phonepe.com/apis/pg-sandbox"
      : "https://api.phonepe.com/apis/hermes";

    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const saltKey = process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_SALT_INDEX || "1";

    // ✅ Construct payment payload
    const payload = {
      merchantId,
      merchantTransactionId: orderId.toString(),
      merchantUserId: req.user.id.toString(),
      amount: amountPaise,
      redirectUrl: `${process.env.FRONTEND_URL}/payment-callback?orderId=${orderId}`,
      redirectMode: "REDIRECT",
      // ⚠️ Don't add "/api" again — already in BACKEND_URL
      callbackUrl: `${process.env.BACKEND_URL}/payment/phonepe-webhook`,
      paymentInstrument: {
        type: "PAY_PAGE",
      },
    };

    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64");

    // 🔹 Generate checksum header
    const stringToSign = `${encodedPayload}/pg/v1/pay${saltKey}`;
    const sha256 = crypto.createHash("sha256").update(stringToSign).digest("hex");
    const xVerify = `${sha256}###${saltIndex}`;

    // 🔹 Send request to PhonePe API
    const phonePeRes = await axios.post(
      `${baseUrl}/pg/v1/pay`,
      { request: encodedPayload },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          "X-MERCHANT-ID": merchantId,
          accept: "application/json",
        },
      }
    );

    const responseData = phonePeRes.data;
    const redirectUrl = responseData?.data?.instrumentResponse?.redirectInfo?.url;

    if (!redirectUrl) {
      console.error("Invalid PhonePe response:", responseData);
      return res.status(500).json({ error: "Failed to initiate PhonePe payment" });
    }

    // ✅ Return redirect URL to frontend
    return res.json({ success: true, redirectUrl });
  } catch (err) {
    console.error("PhonePe order creation failed:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create PhonePe order" });
  }
});

/**
 * ✅ PHONEPE CALLBACK / WEBHOOK
 */
router.post("/phonepe-webhook", async (req, res) => {
  try {
    const { merchantTransactionId, transactionId, code } = req.body?.data || {};
    const paymentStatus = code === "PAYMENT_SUCCESS" ? "paid" : "failed";

    // 🔹 Update order in DB
    await db.query(
      "UPDATE orders SET status = $1, phonepe_payment_id = $2 WHERE id = $3",
      [paymentStatus, transactionId, merchantTransactionId]
    );

    // 🔹 If payment successful → send emails & clear cart
    if (paymentStatus === "paid") {
      const userRes = await db.query(
        "SELECT user_id FROM orders WHERE id = $1",
        [merchantTransactionId]
      );
      const userId = userRes.rows[0]?.user_id;

      if (userId) {
        await db.query("DELETE FROM cart_items WHERE user_id = $1", [userId]);
      }

      const orderItemsRes = await db.query(
        `SELECT oi.product_id, oi.quantity, oi.price, p.name
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [merchantTransactionId]
      );

      const items = orderItemsRes.rows.map((i) => ({
        product_id: i.product_id,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
      }));

      const userEmailRes = await db.query(
        "SELECT email, name FROM users WHERE id = $1",
        [userId]
      );
      const user = userEmailRes.rows[0];
      const adminEmail = process.env.ADMIN_EMAIL?.trim();

      if (user?.email) {
        try {
          await sendOrderEmail(user.email, {
            orderId: merchantTransactionId,
            total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
            items,
            status: "Paid",
            paymentMethod: "UPI (PhonePe)",
            message: `Dear ${user.name || "Customer"}, your order #${String(
              merchantTransactionId
            ).padStart(6, "0")} has been successfully paid.`,
          });

          if (adminEmail) {
            await sendOrderEmail(adminEmail, {
              orderId: merchantTransactionId,
              total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
              items,
              status: "Paid",
              paymentMethod: "UPI (PhonePe)",
              message: `New order paid by ${user.name || user.email} - Order #${String(
                merchantTransactionId
              ).padStart(6, "0")}.`,
            });
          }
        } catch (e) {
          console.error("Email sending failed:", e);
        }
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("PhonePe webhook error:", err);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
