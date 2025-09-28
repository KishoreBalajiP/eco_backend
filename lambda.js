// lambda.js
import serverlessExpress from "@vendia/serverless-express";
import app from "./app.js";  // import your Express app

// Export the Lambda handler
export const handler = serverlessExpress({ app });