// utils/email.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export const sendOrderEmail = async (toEmail, { orderId, total }) => {
  if (!process.env.SMTP_USER) return; // skip if not configured
  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: toEmail,
      subject: `Order Confirmation #${orderId}`,
      text: `Thanks for your order!\nOrder #: ${orderId}\nTotal: ${total}\n\nWe'll update you when it's shipped.`
    });
  } catch (err) {
    console.error("Email send failed", err);
  }
};
