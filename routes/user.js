// backend/routes/user.js
import express from "express";
import db from "../db.js"; // using the same db as orders.js
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// -------------------- Get current user's shipping address --------------------
router.get("/me/shipping", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT shipping_name, shipping_mobile, shipping_line1, shipping_line2, 
              shipping_city, shipping_state, shipping_postal_code, shipping_country
       FROM users 
       WHERE id = $1`,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return existing address or empty template
    const address = result.rows[0] || {
      shipping_name: "",
      shipping_mobile: "",
      shipping_line1: "",
      shipping_line2: "",
      shipping_city: "",
      shipping_state: "",
      shipping_postal_code: "",
      shipping_country: "",
    };

    res.json(address);
  } catch (err) {
    console.error("Error fetching shipping:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// -------------------- Update current user's shipping address --------------------
router.put("/me/shipping", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      shipping_name,
      shipping_mobile,
      shipping_line1,
      shipping_line2,
      shipping_city,
      shipping_state,
      shipping_postal_code,
      shipping_country,
    } = req.body;

    await db.query(
      `UPDATE users 
       SET shipping_name = $1,
           shipping_mobile = $2,
           shipping_line1 = $3,
           shipping_line2 = $4,
           shipping_city = $5,
           shipping_state = $6,
           shipping_postal_code = $7,
           shipping_country = $8
       WHERE id = $9`,
      [
        shipping_name,
        shipping_mobile,
        shipping_line1,
        shipping_line2,
        shipping_city,
        shipping_state,
        shipping_postal_code,
        shipping_country,
        userId,
      ]
    );

    res.json({ message: "Shipping address updated successfully" });
  } catch (err) {
    console.error("Error updating shipping:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;