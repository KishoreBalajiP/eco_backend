// routes/admin.js
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { isAdmin } from "../middleware/admin.js";
import multer from "multer";
import s3 from "../utils/s3.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";

const router = express.Router();
const upload = multer(); // in-memory storage for file uploads

// -------------------- Products --------------------

// Add product with image upload
router.post("/products", authMiddleware, isAdmin, upload.single("image"), async (req, res) => {
  const { name, description, price, stock } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ error: "Image file is required" });
  if (!name || !description || !price || !stock)
    return res.status(400).json({ error: "All fields are required" });

  try {
    // Upload image to S3 using AWS SDK v3
    const key = `products/${Date.now()}-${file.originalname}`;
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    };
    const command = new PutObjectCommand(params);
    await s3.send(command);

    const image_url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    // Convert price and stock to numbers
    const numericPrice = Number(price);
    const numericStock = Number(stock);

    // Insert product into DB
    const result = await pool.query(
      "INSERT INTO products (name, description, price, stock, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, description, numericPrice, numericStock, image_url]
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

  if (!name || !description || !price || !stock)
    return res.status(400).json({ error: "All fields are required" });

  try {
    let image_url;

    if (file) {
      // Upload new image to S3 using AWS SDK v3
      const key = `products/${Date.now()}-${file.originalname}`;
      const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      };
      const command = new PutObjectCommand(params);
      await s3.send(command);

      image_url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    } else {
      // Keep existing image if no new file uploaded
      const existing = await pool.query("SELECT image_url FROM products WHERE id=$1", [id]);
      image_url = existing.rows[0]?.image_url || null;
    }

    const numericPrice = Number(price);
    const numericStock = Number(stock);

    const result = await pool.query(
      "UPDATE products SET name=$1, description=$2, price=$3, stock=$4, image_url=$5 WHERE id=$6 RETURNING *",
      [name, description, numericPrice, numericStock, image_url, id]
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
    console.error(err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// -------------------- Orders --------------------

// View all orders
router.get("/orders", authMiddleware, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.user_id, o.total, o.status, o.cancelled_by, o.created_at, 
              o.shipping_name, o.shipping_mobile, o.shipping_line1, o.shipping_line2, 
              o.shipping_city, o.shipping_state, o.shipping_postal_code, o.shipping_country,
              u.email
       FROM orders o
       JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC`
    );

    const orders = result.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      user: row.email,
      total: row.total,
      status: row.status,
      cancelled_by: row.cancelled_by,
      created_at: row.created_at,
      shipping: {
        shipping_name: row.shipping_name,
        shipping_mobile: row.shipping_mobile,
        shipping_line1: row.shipping_line1,
        shipping_line2: row.shipping_line2,
        shipping_city: row.shipping_city,
        shipping_state: row.shipping_state,
        shipping_postal_code: row.shipping_postal_code,
        shipping_country: row.shipping_country,
      },
    }));

    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Get single order with items
router.get("/orders/:id", authMiddleware, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const orderResult = await pool.query(
      `SELECT o.id, o.user_id, o.total, o.status, o.cancelled_by, o.created_at,
              o.shipping_name, o.shipping_mobile, o.shipping_line1, o.shipping_line2,
              o.shipping_city, o.shipping_state, o.shipping_postal_code, o.shipping_country,
              u.email
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id=$1`,
      [id]
    );

    if (!orderResult.rows.length) return res.status(404).json({ error: "Order not found" });

    const orderRow = orderResult.rows[0];

    const itemsResult = await pool.query(
      `SELECT oi.product_id, oi.quantity, oi.price, p.name
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id=$1`,
      [id]
    );

    const order = {
      id: orderRow.id,
      user_id: orderRow.user_id,
      user: orderRow.email,
      total: orderRow.total,
      status: orderRow.status,
      cancelled_by: orderRow.cancelled_by,
      created_at: orderRow.created_at,
      shipping: {
        shipping_name: orderRow.shipping_name,
        shipping_mobile: orderRow.shipping_mobile,
        shipping_line1: orderRow.shipping_line1,
        shipping_line2: orderRow.shipping_line2,
        shipping_city: orderRow.shipping_city,
        shipping_state: orderRow.shipping_state,
        shipping_postal_code: orderRow.shipping_postal_code,
        shipping_country: orderRow.shipping_country,
      },
      items: itemsResult.rows.map((item) => ({
        product_id: item.product_id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
    };

    res.json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch order details" });
  }
});

// Update order status
router.patch("/orders/:id/status", authMiddleware, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) return res.status(400).json({ error: "Status is required" });

  let cancelled_by = null;
  if (status === 'cancelled') {
    cancelled_by = 'admin';
  }

  try {
    const result = await pool.query(
      "UPDATE orders SET status=$1, cancelled_by=$2 WHERE id=$3 RETURNING *",
      [status, cancelled_by, id]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Order not found" });

    res.json({ order: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// -------------------- Users --------------------

// Get all users
router.get("/users", authMiddleware, isAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, email, name, role FROM users");
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Update user role
router.patch("/users/:id/role", authMiddleware, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role) return res.status(400).json({ error: "Role is required" });

  try {
    const result = await pool.query(
      "UPDATE users SET role=$1 WHERE id=$2 RETURNING id, email, role",
      [role, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update user role" });
  }
});

export default router;
