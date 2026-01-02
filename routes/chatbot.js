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

// Greetings list
const GREETINGS = ["hi", "hello", "hey", "good morning", "good evening"];

// Jaya Stores Knowledge Base
const JAYASTORES_KNOWLEDGE = `
JAYA STORES - COMPLETE INFORMATION

STORE INFORMATION:
- Website: https://jayastores.vercel.app
- E-commerce store selling variety of products
- Products: Grocery, Dairy products, Daily needs (toothpaste, toothbrush, etc.)
- Physical Address: Jaya Stores, 168/3 Bajanai Kovil Street, Theetalam, Chengalpattu, TamilNadu, India - 603406
- Store Hours: Not specified, but phone support available 10:00 AM to 6:00 PM IST, Monday to Saturday

CONTACT INFORMATION:
- Email: contactjayastores@gmail.com (primary contact)
- Phone: +91 6381858714 (10:00 AM to 6:00 PM IST, Monday to Saturday)
- Response Time: Typically 24-48 hours for email queries

PRODUCTS AVAILABLE:
- Grocery items
- Dairy products (milk, fresh dairy)
- Daily needs and personal care
- Toothpaste, toothbrush, and hygiene items

SHIPPING & DELIVERY:
- Delivery Areas: Theetalam, L.Endathur, and Uthiramerur only
- Other locations: Contact jayastores for assistance
- Processing Time: 1-2 business days after order confirmation
- Delivery Time: 0-7 business days
- Shipping: Free standard shipping for all orders
- Order Tracking: Provided after shipment

RETURNS & REFUNDS POLICY:
- Return Period: 7 days from delivery
- Conditions: Unused, original packaging, resalable condition
- Non-returnable: Perishable goods (milk, fresh dairy), opened hygiene items
- Refund Processing: 5-7 business days after return inspection
- Return Process: Email support with order ID and reason

PRIVACY POLICY:
- Data Collection: Personal details, payment info, order history, localStorage data
- Data Usage: Order processing, service improvement, personalized experience
- Data Sharing: Only with shipping partners, payment processors, or legal compliance
- Data Security: Protected against unauthorized access
- Your Rights: Access, correction, or deletion of personal information

TERMS & CONDITIONS:
- Account: Users responsible for account security
- Orders: Subject to product availability
- Pricing: Subject to change without notice
- Payment: Secure transactions with encryption
- Jurisdiction: Chengalpattu, Tamil Nadu, India

IMPORTANT NOTES:
- Always provide contactjayastores@gmail.com for detailed queries
- For order-specific issues, ask users to provide order ID
- For delivery outside listed areas, direct to contact support
- For fresh dairy products, emphasize they are non-returnable
- Always be helpful and provide complete information
`;

/**
 * POST /api/chatbot/message
 * Handles chatbot messages for Jayastores website queries
 */
router.post("/message", async (req, res) => {
  const { message } = req.body;
    const userId = req.user?.id || req.ip;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  // --- Free tier check (in-memory, reset daily) ---
  if (!global.userQueries) global.userQueries = {};
  const today = new Date().toDateString();
  if (!global.userQueries[userId]) global.userQueries[userId] = {};
  if (!global.userQueries[userId][today]) global.userQueries[userId][today] = 0;

  if (global.userQueries[userId][today] >= 5) {
    return res.json({ 
      reply: "Your free tier limit of 5 queries per day is over. Please contact us directly at contactjayastores@gmail.com for further assistance." 
    });
  }

  global.userQueries[userId][today] += 1;

  // --- Greeting check ---
  if (GREETINGS.some(g => message.toLowerCase().includes(g))) {
    return res.json({ 
      reply: "Hello! Welcome to Jaya Stores! I can help you with our products (grocery, dairy, daily needs), shipping information, returns policy, orders, and store details. How can I assist you today?" 
    });
  }

  try {
    const token = await getAccessToken();
    const model = "gemini-pro";

    // Enhanced system instructions for Gemini
    const SYSTEM_INSTRUCTIONS = `
You are a helpful customer support chatbot for Jaya Stores (jayastores.vercel.app). 

IMPORTANT RULES:
1. ANSWER ALL QUESTIONS related to Jaya Stores - never say "sorry I can't help with that"
2. Always be positive, helpful, and informative
3. Use the knowledge base below for accurate information
4. For complex or specific issues, provide contactjayastores@gmail.com
5. If unsure about something, still try to help and provide contact email

KNOWLEDGE BASE:
${JAYASTORES_KNOWLEDGE}

RESPONSE GUIDELINES:
- For product queries: List available categories (grocery, dairy, daily needs)
- For shipping: Mention delivery areas and free shipping
- For returns: Explain 7-day policy and non-returnable items
- For contact: Always provide email and phone
- For policies: Summarize key points briefly
- Always end with offering further help

Current user question: "${message}"
`;

    const prompt = [
      { text: SYSTEM_INSTRUCTIONS },
      { text: `User Question: ${message}` }
    ];

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        contents: [{ parts: prompt }],
        generationConfig: { 
          maxOutputTokens: 800, 
          temperature: 0.3,
          topP: 0.8,
          topK: 40
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      },
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        timeout: 15000,
      }
    );

    let botMessage = "I'd be happy to help you with that! For detailed assistance, please contact us at contactjayastores@gmail.com or call +91 6381858714.";

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      botMessage = response.data.candidates[0].content.parts[0].text;
      
      // Ensure the response doesn't contain refusal phrases
      const refusalPhrases = [
        "sorry, i cannot", 
        "i can't help", 
        "i'm not able to", 
        "i don't have information about",
        "i'm not programmed to"
      ];
      
      if (refusalPhrases.some(phrase => botMessage.toLowerCase().includes(phrase))) {
        botMessage = `I understand you're asking about "${message}". At Jaya Stores, we offer grocery, dairy, and daily needs products with free shipping to Theetalam, L.Endathur, and Uthiramerur. For specific details about your query, please contact us at contactjayastores@gmail.com or call +91 6381858714. We'll be happy to assist you!`;
      }
    }

    res.json({ 
      reply: botMessage, 
      modelUsed: model,
      queriesUsed: global.userQueries[userId][today],
      queriesLeft: 5 - global.userQueries[userId][today]
    });
  } catch (err) {
    console.error("Gemini API error:", err.response?.data || err.message);
    
    // Fallback response that still helps the user
    const fallbackResponse = `I'd love to help you with your question about Jaya Stores! Currently, I'm having trouble accessing my full knowledge base. Please contact us directly at contactjayastores@gmail.com or call +91 6381858714 for immediate assistance. We offer grocery, dairy, and daily needs products with free shipping!`;
    
    res.json({ 
      reply: fallbackResponse,
      error: "API issue - using fallback response"
    });
  }
});

/**
 * GET /api/chatbot/info
 * Provides information about Jaya Stores (public endpoint)
 */
router.get("/info", (req, res) => {
  res.json({
    store: "Jaya Stores",
    website: "https://jayastores.vercel.app",
    products: ["Grocery", "Dairy Products", "Daily Needs", "Personal Care"],
    contact: {
      email: "contactjayastores@gmail.com",
      phone: "+91 6381858714",
      hours: "10:00 AM to 6:00 PM IST, Monday to Saturday"
    },
    shipping: {
      areas: ["Theetalam", "L.Endathur", "Uthiramerur"],
      delivery: "0-7 business days",
      cost: "Free standard shipping"
    }
  });
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