// routes/chatbot.js
import express from "express";
import axios from "axios";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/**
 * POST /api/chatbot/message
 * body: { message, sessionId? }
 * This route forwards the user message to the external AI API and returns the response.
 */
router.post("/message", authMiddleware, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  try {
    // Example using OpenAI completions (chat API). If using a different API, update accordingly.
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Chatbot API key not configured" });

    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini", // change as preferred
      messages: [
        { role: "system", content: "You are a helpful customer support chatbot for an e-commerce grocery/dairy wholesale store." },
        { role: "user", content: message }
      ],
      max_tokens: 500
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    const botMessage = response.data.choices?.[0]?.message?.content || "Sorry, no response";
    res.json({ reply: botMessage });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Chatbot error" });
  }
});

export default router;
