import express from "express";
import bcrypt from "bcrypt";
import db from "../db.js";
import { transporter } from "../utils/email.js"; // your email transporter
import cron from "node-cron";

const router = express.Router();

// ------------------- UTILITY -------------------
async function sendOtpEmail(toEmail, otp) {
  const html = `
    <div style="font-family:sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #eee;">
      <h2>Password Reset OTP</h2>
      <p>Your OTP for resetting your password is:</p>
      <h1 style="text-align:center; letter-spacing:5px;">${otp}</h1>
      <p>This OTP will expire in <strong>10 minutes</strong>.</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: toEmail,
    subject: "Your Password Reset OTP",
    html,
  });
}

// ------------------- ROUTES -------------------

//  Generate OTP (Forgot Password)
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    const userRes = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (!userRes.rows.length) return res.status(404).json({ message: "User not found" });

    const userId = userRes.rows[0].id;

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Save OTP in DB
    await db.query(
      `INSERT INTO password_otps (user_id, otp, expires_at) VALUES ($1, $2, $3)`,
      [userId, otp, expiresAt]
    );

    // Send email
    await sendOtpEmail(email, otp);

    res.json({ success: true, message: "OTP sent to your email." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

//  Verify OTP
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required." });

  try {
    const userRes = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (!userRes.rows.length) return res.status(404).json({ message: "User not found" });

    const userId = userRes.rows[0].id;

    const otpRes = await db.query(
      `SELECT * FROM password_otps 
       WHERE user_id = $1 AND otp = $2 AND verified = false
       ORDER BY id DESC LIMIT 1`,
      [userId, otp]
    );

    if (!otpRes.rows.length) return res.status(400).json({ message: "Invalid OTP." });

    const record = otpRes.rows[0];

    // Check expiry
    if (new Date() > record.expires_at) {
      // Delete expired OTP
      await db.query("DELETE FROM password_otps WHERE id = $1", [record.id]);
      return res.status(400).json({ message: "OTP expired." });
    }

    // Mark OTP as verified
    await db.query("UPDATE password_otps SET verified = true WHERE id = $1", [record.id]);

    res.json({ success: true, message: "OTP verified." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

//  Reset Password
router.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) return res.status(400).json({ message: "Email and new password required." });

  try {
    const userRes = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (!userRes.rows.length) return res.status(404).json({ message: "User not found" });

    const userId = userRes.rows[0].id;

    // Ensure OTP was verified
    const otpRes = await db.query(
      `SELECT * FROM password_otps WHERE user_id = $1 AND verified = true ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (!otpRes.rows.length) return res.status(400).json({ message: "OTP not verified." });

    // Update password
    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, userId]);

    // Delete all OTPs for this user (clean-up)
    await db.query("DELETE FROM password_otps WHERE user_id = $1", [userId]);

    res.json({ success: true, message: "Password reset successful." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ------------------- OPTIONAL CRON CLEANUP -------------------
// Run every hour to delete expired & unverified OTPs
// cron.schedule("0 * * * *", async () => {
//   try {
//     const result = await db.query(
//       "DELETE FROM password_otps WHERE expires_at < NOW() AND verified = false"
//     );
//     console.log(` OTP cleanup done: ${result.rowCount} expired OTPs removed`);
//   } catch (err) {
//     console.error("OTP cleanup failed:", err);
//   }
// });

// export default router;
