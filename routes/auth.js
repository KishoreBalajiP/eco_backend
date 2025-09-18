// routes/auth.js
import express from "express";
import bcrypt from "bcrypt";
import db from "../db.js";
import { generateToken, authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/**
 * POST /api/auth/register
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
      // user: {
      //   id: user.id,
      //   name: user.name,
      //   email: user.email,
      //   role: user.role,
      // },
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
 * POST /api/auth/login
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Please enter both email and password." });
  }

  try {
    const result = await db.query(
      "SELECT id, email, password, name, role FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      return res
        .status(400)
        .json({ message: "No account found with this email. Please register." });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res
        .status(400)
        .json({ message: "Invalid email or password. Please try again." });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      // user: {
      //   id: user.id,
      //   name: user.name,
      //   email: user.email,
      //   role: user.role,
      // },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "An unexpected server error occurred." });
  }
});

/**
 * GET /api/auth/me
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

export default router;
