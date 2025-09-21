// routes/chatbot.js
import express from "express";
import axios from "axios";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

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
    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      console.error("ERROR: GOOGLE_API_KEY environment variable is not set");
      return res.status(500).json({ 
        error: "Server configuration error",
        details: "API key not configured"
      });
    }

    console.log("Received message:", message);
    
    // Use the correct Gemini API endpoint with the proper model name
    // The current model names are different from what you were using
    const model = "gemini-1.5-flash-latest"; // Current recommended model
    
    console.log(`Using model: ${model}`);
    
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: [{
            text: message
          }]
        }],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.7
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000
      }
    );

    // Extract the response - the structure might be different
    let botMessage = "Sorry, I couldn't generate a response. Please try again.";
    
    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      botMessage = response.data.candidates[0].content.parts[0].text;
    } else if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      // Alternative response structure
      botMessage = response.data.candidates[0].content.parts[0].text;
    } else if (response.data?.candidates?.[0]?.content?.text) {
      // Another possible response structure
      botMessage = response.data.candidates[0].content.text;
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
    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: "API key not configured" });
    }

    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      {
        headers: {
          "Content-Type": "application/json",
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