import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export const sendOrderEmail = async (toEmail, { orderId, total, items, status, paymentMethod }) => {
  if (!process.env.SMTP_USER) return;

  try {
    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding:5px 10px;">${item.name}</td>
        <td style="padding:5px 10px; text-align:center;">${item.quantity}</td>
        <td style="padding:5px 10px; text-align:right;">₹${item.price.toFixed(2)}</td>
      </tr>
    `).join("");

    const html = `
      <div style="font-family:sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #eee;">
        <h2 style="color:#333;">Order Confirmed!</h2>
        <p>Thank you for your order. We've received your order and will process it shortly.</p>
        
        <h3>Order Details</h3>
        <p><strong>Order ID:</strong> ORD-${String(orderId).padStart(6,'0')}</p>
        <p><strong>Status:</strong> ${status}</p>
        <p><strong>Payment Method:</strong> ${paymentMethod}</p>
        
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

        <p>We will update you when your order is shipped.</p>
        <p>Happy Shopping!</p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: toEmail,
      subject: `Order Confirmation - ORD-${String(orderId).padStart(6,'0')}`,
      html
    });

  } catch (err) {
    console.error("Email send failed", err);
  }
};
