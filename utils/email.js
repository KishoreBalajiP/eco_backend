import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Sends a professional order email.
 * @param {string} toEmail - Recipient email
 * @param {object} param1 - Email details
 * @param {number} param1.orderId
 * @param {number} param1.total
 * @param {Array} param1.items
 * @param {string} param1.status
 * @param {string} [param1.paymentMethod]
 * @param {string} [param1.message] - Custom message
 * @param {object} [param1.shipping] - Shipping info snapshot
 */
export const sendOrderEmail = async (
  toEmail,
  { orderId, total, items, status, paymentMethod, message, shipping }
) => {
  if (!process.env.SMTP_USER || !toEmail) return;

  try {
    total = Number(total) || 0;

    const itemsHtml = items
      .map(item => {
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 0;
        return `
          <tr>
            <td style="padding:5px 10px;">${item.name}</td>
            <td style="padding:5px 10px; text-align:center;">${quantity}</td>
            <td style="padding:5px 10px; text-align:right;">₹${price.toFixed(2)}</td>
          </tr>
        `;
      })
      .join("");

    // Shipping HTML if provided
    const shippingHtml = shipping
      ? `
        <h3>Shipping Address</h3>
        <p>
          <strong>Name:</strong> ${shipping.shipping_name}<br/>
          <strong>Mobile:</strong> ${shipping.shipping_mobile}<br/>
          ${shipping.shipping_line1}${shipping.shipping_line2 ? ", " + shipping.shipping_line2 : ""}<br/>
          ${shipping.shipping_city}, ${shipping.shipping_state} - ${shipping.shipping_postal_code}<br/>
          ${shipping.shipping_country}
        </p>
      `
      : "";

    const html = `
      <div style="font-family:sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #eee;">
        <h2 style="color:#333;">Order Update</h2>
        <p>${message || "Thank you for your order. We've received it and will process shortly."}</p>

        <h3>Order Details</h3>
        <p><strong>Order ID:</strong> ORD-${String(orderId).padStart(6, "0")}</p>
        <p><strong>Status:</strong> ${status}</p>
        ${paymentMethod ? `<p><strong>Payment Method:</strong> ${paymentMethod}</p>` : ""}
        ${shippingHtml}

        <table width="100%" style="border-collapse: collapse; margin-top:10px;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:5px 10px; text-align:left;">Product</th>
              <th style="padding:5px 10px; text-align:center;">Qty</th>
              <th style="padding:5px 10px; text-align:right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <p style="text-align:right; font-weight:bold;">Total: ₹${total.toFixed(2)}</p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: toEmail,
      subject: `Order Update - ORD-${String(orderId).padStart(6, "0")}`,
      html,
    });

    console.log(`Email sent to ${toEmail} for order #${orderId}`);
  } catch (err) {
    console.error("Email send failed", err);
  }
};
