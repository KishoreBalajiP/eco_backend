// app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(
  cors({
    origin: "http://localhost:5173", // update if frontend runs elsewhere
    credentials: true,
  })
);

// Routes
import authRoutes from "./routes/auth.js";
import productsRoutes from "./routes/products.js";
import cartRoutes from "./routes/cart.js";
import ordersRoutes from "./routes/orders.js";
import paymentsRoutes from "./routes/payments.js";
import chatbotRoutes from "./routes/chatbot.js";
import adminRoutes from "./routes/admin.js";
import otpAuthRoutes from "./routes/otpAuth.js";
import userRoutes from "./routes/user.js";

app.use("/api/auth", authRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/auth", otpAuthRoutes);
app.use("/api/users", userRoutes);

// Health check
app.get("/api/health", (req, res) => res.json({ ok: true }));

export default app;
