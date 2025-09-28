// routes/chatbot.js
import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { authMiddleware } from "../middleware/auth.js";
import { GoogleAuth } from "google-auth-library";

const router = express.Router();

// Load the service account JSON
const serviceAccountPath = path.resolve('./chatbot-service.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

// Create Google Auth client
const auth = new GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// Helper to get access token
async function getAccessToken() {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

/**
 * POST /api/chatbot/message
 * Forwards the user message to Google Gemini API and returns the response.
 */
router.post("/message", authMiddleware, async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const token = await getAccessToken();
    const model = "gemini-1.5-flash-latest";

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        contents: [{ parts: [{ text: message }] }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
      },
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    let botMessage = "Sorry, I couldn't generate a response.";

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      botMessage = response.data.candidates[0].content.parts[0].text;
    }

    console.log("Bot response generated successfully");
    res.json({ reply: botMessage, modelUsed: model });

  } catch (err) {
    console.error("Gemini API error:", err.message);
    if (err.response) {
      console.error("API response error:", err.response.data);
      res.status(err.response.status).json({
        error: "Gemini API error",
        details: err.response.data.error?.message || "Unknown API error"
      });
    } else if (err.request) {
      console.error("No response received from API");
      res.status(503).json({
        error: "Service unavailable",
        details: "No response from Gemini API"
      });
    } else {
      console.error("Request setup error:", err.message);
      res.status(500).json({
        error: "Server error",
        details: err.message
      });
    }
  }
});

/**
 * GET /api/chatbot/models
 * Lists available models to help debug
 */
router.get("/models", authMiddleware, async (req, res) => {
  try {
    const token = await getAccessToken();

    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    res.json({ models: response.data.models });
  } catch (err) {
    console.error("Error fetching models:", err.response?.data || err.message);
    res.status(500).json({
      error: "Failed to fetch models",
      details: err.response?.data?.error?.message || err.message
    });
  }
});

export default router;
