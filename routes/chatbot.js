// routes/chatbot.js
import express from "express";
import axios from "axios";
import { authMiddleware } from "../middleware/auth.js";
import { GoogleAuth } from "google-auth-library";

const router = express.Router();

// Load service account credentials from environment variables
const serviceAccount = {
  type: "service_account",
  project_id: process.env.GCP_PROJECT_ID,
  private_key_id: process.env.GCP_PRIVATE_KEY_ID,
  private_key: process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.GCP_CLIENT_EMAIL,
  client_id: process.env.GCP_CLIENT_ID,
  auth_uri: process.env.GCP_AUTH_URI,
  token_uri: process.env.GCP_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.GCP_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.GCP_CLIENT_X509_CERT_URL,
  universe_domain: process.env.GCP_UNIVERSE_DOMAIN,
};

// Create Google Auth client with generative language scope
const auth = new GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/generative-language"],
});

// Helper to get access token
async function getAccessToken() {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

// Allowed keywords for website-related responses
const ALLOWED_KEYWORDS = [
  "product", "products", "contact", "store", "refund", "return",
  "order", "policy", "privacy", "legal", "history", "created",
  "how the store came", "quality", "expired", "date"
];

// Greetings list
const GREETINGS = ["hi", "hello", "hey", "good morning", "good evening"];

/**
 * POST /api/chatbot/message
 * Handles chatbot messages for website-only queries with free tier
 */
router.post("/message", authMiddleware, async (req, res) => {
  const { message, userId } = req.body; // userId from authMiddleware

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  // --- Free tier check (in-memory, reset daily) ---
  if (!global.userQueries) global.userQueries = {};
  const today = new Date().toDateString();
  if (!global.userQueries[userId]) global.userQueries[userId] = {};
  if (!global.userQueries[userId][today]) global.userQueries[userId][today] = 0;

  if (global.userQueries[userId][today] >= 5) {
    return res.json({ reply: "Your free tier limit of 5 queries per day is over." });
  }

  global.userQueries[userId][today] += 1;

  // --- Greeting check ---
  if (GREETINGS.some(g => message.toLowerCase().includes(g))) {
    return res.json({ reply: "Hello! I can help you with jayastores products, store info, policies, and more." });
  }

  try {
    const token = await getAccessToken();
    const model = "gemini-pro-latest"; // Latest stable model

    // System instructions for Gemini
    const WEBSITE_TOPICS = `
You are a chatbot for jayastores.com. Only answer questions related to:
- Products available on the website
- Product quality (we check dates, no expired items)
- Contact information for the store
- Refunds, returns, and order policies
- Store location and hours
- Privacy, legal, and store history
Do not answer unrelated questions.
`;

    const prompt = [
      { text: WEBSITE_TOPICS },
      { text: message }
    ];

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        contents: [{ parts: prompt }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.5 },
      },
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    // --- Filter response based on allowed keywords ---
    let botMessage = "Sorry, I can only answer questions about jayastores.";

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const rawMessage = response.data.candidates[0].content.parts[0].text.toLowerCase();
      const isAllowed = ALLOWED_KEYWORDS.some(keyword => rawMessage.includes(keyword));
      if (isAllowed) botMessage = response.data.candidates[0].content.parts[0].text;
    }

    res.json({ reply: botMessage, modelUsed: model });
  } catch (err) {
    console.error("Gemini API error:", err.response?.data || err.message);
    res.status(500).json({
      error: "Failed to generate response",
      details: err.response?.data?.error?.message || err.message,
    });
  }
});

/**
 * GET /api/chatbot/models
 * Lists available models for debugging
 */
router.get("/models", authMiddleware, async (req, res) => {
  try {
    const token = await getAccessToken();

    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models`,
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    res.json({ models: response.data.models });
  } catch (err) {
    console.error("Error fetching models:", err.response?.data || err.message);
    res.status(500).json({
      error: "Failed to fetch models",
      details: err.response?.data?.error?.message || err.message,
    });
  }
});

export default router;
