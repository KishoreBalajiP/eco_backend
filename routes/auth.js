import express from "express";
import bcrypt from "bcrypt";
import db from "../db.js";
import { generateToken, authMiddleware } from "../middleware/auth.js";
import { sendRegistrationOtp } from "../utils/email.js"; // updated import

const router = express.Router();

/**
 * ---------------------------
 *  Existing Register (direct registration)
 * ---------------------------
 */
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (email, password, name) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, name, role`,
      [email, hashed, name || null]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(400)
        .json({ message: "This email is already registered. Please sign in." });
    }
    console.error(err);
    res.status(500).json({ message: "An unexpected server error occurred." });
  }
});

/**
 * ---------------------------
 *  Existing Login
 * ---------------------------
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Please enter both email and password." });
  }

  try {
    const result = await db.query(
      "SELECT id, email, password, name, role FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(400).json({ message: "No account found with this email. Please register." });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(400).json({ message: "Invalid email or password. Please try again." });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "An unexpected server error occurred." });
  }
});

/**
 * ---------------------------
 *  Existing /me
 * ---------------------------
 */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, email, name, role, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ message: "User not found." });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "An unexpected server error occurred." });
  }
});

/**
 * ---------------------------
 *  Registration OTP - Initiate
 * ---------------------------
 */
router.post("/register/initiate", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required." });

  try {
    // Check if user already exists
    const userCheck = await db.query("SELECT id FROM users WHERE email=$1", [email]);
    if (userCheck.rows.length) {
      return res.status(400).json({ message: "Email already registered." });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Insert OTP in DB
    await db.query(
      `INSERT INTO password_otps (otp, expires_at, purpose) 
       VALUES ($1, $2, 'registration')`,
      [otp, expiresAt]
    );

    // Send OTP via email using the utility function
    await sendRegistrationOtp(email, otp);

    res.json({ success: true, message: "OTP sent to email." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

/**
 * ---------------------------
 *  Registration OTP - Verify
 * ---------------------------
 */
router.post("/register/verify", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: "Email and OTP required." });

  try {
    const otpEntry = await db.query(
      `SELECT id FROM password_otps 
       WHERE otp=$1 AND purpose='registration' AND verified=false AND expires_at > NOW() 
       ORDER BY id DESC LIMIT 1`,
      [otp]
    );

    if (!otpEntry.rows.length) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    // Mark OTP as verified
    await db.query("UPDATE password_otps SET verified=true WHERE id=$1", [otpEntry.rows[0].id]);

    res.json({ success: true, message: "OTP verified successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

/**
 * ---------------------------
 *  Registration Complete
 * ---------------------------
 */
router.post("/register/complete", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email and password required." });

  try {
    // Check verified OTP exists
    const otpCheck = await db.query(
      `SELECT id FROM password_otps 
       WHERE purpose='registration' AND verified=true AND expires_at > NOW() 
       ORDER BY id DESC LIMIT 1`
    );

    if (!otpCheck.rows.length) {
      return res.status(400).json({ message: "OTP not verified. Cannot complete registration." });
    }

    // Hash password & create user
    const hashed = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (email, password, name) VALUES ($1, $2, $3)
       RETURNING id, email, name, role`,
      [email, hashed, name || null]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

export default router;
