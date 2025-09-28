// server.js
import app from "./app.js";

const PORT = process.env.PORT || 5000;

// Only start local server
if (process.env.NODE_ENV !== "lambda") {
  app.listen(PORT, () => {
    console.log(`Server running locally on http://localhost:${PORT}`);
  });
}
