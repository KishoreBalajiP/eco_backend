import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { isAdmin } from "../middleware/admin.js";
import multer from "multer";
import s3 from "../utils/s3.js";

const router = express.Router();
const upload = multer(); // in-memory storage for file uploads

// Add product with image upload
router.post("/products", authMiddleware, isAdmin, upload.single("image"), async (req, res) => {
  const { name, description, price, stock } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ error: "Image file is required" });

  try {
    // Upload image to S3
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `products/${Date.now()}-${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: "public-read",
    };

    const uploadResult = await s3.upload(params).promise();
    const image_url = uploadResult.Location;

    // Insert product into DB
    const result = await pool.query(
      "INSERT INTO products (name, description, price, stock, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, description, price, stock, image_url]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add product" });
  }
});

// Update product with optional new image
router.put("/products/:id", authMiddleware, isAdmin, upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { name, description, price, stock } = req.body;
  const file = req.file;

  try {
    let image_url;

    if (file) {
      // Upload new image to S3
      const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `products/${Date.now()}-${file.originalname}`,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: "public-read",
      };
      const uploadResult = await s3.upload(params).promise();
      image_url = uploadResult.Location;
    } else {
      // Keep existing image if no new file uploaded
      const existing = await pool.query("SELECT image_url FROM products WHERE id=$1", [id]);
      image_url = existing.rows[0].image_url;
    }

    const result = await pool.query(
      "UPDATE products SET name=$1, description=$2, price=$3, stock=$4, image_url=$5 WHERE id=$6 RETURNING *",
      [name, description, price, stock, image_url, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

// Delete product
router.delete("/products/:id", authMiddleware, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM products WHERE id=$1", [id]);
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// View all orders
router.get("/orders", authMiddleware, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.user_id, o.total, o.status, o.created_at, u.email
       FROM orders o 
       JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC`
    );

    const orders = result.rows.map((row) => ({
      ...row,
      user: row.email, // frontend expects `user`
    }));

    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

//  Update order status
router.patch("/orders/:id/status", authMiddleware, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await pool.query(
      "UPDATE orders SET status=$1 WHERE id=$2 RETURNING *",
      [status, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update order status" });
  }
});

//  Manage users
router.get("/users", authMiddleware, isAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, email, name, role FROM users");
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.patch("/users/:id/role", authMiddleware, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  try {
    const result = await pool.query(
      "UPDATE users SET role=$1 WHERE id=$2 RETURNING id, email, role",
      [role, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update user role" });
  }
});

export default router;
