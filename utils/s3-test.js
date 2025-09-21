import AWS from "aws-sdk";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// Configure AWS
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

async function testUpload() {
  const fileContent = Buffer.from("Hello, this is a test file!", "utf-8");
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `test/test-file-${Date.now()}.txt`,
    Body: fileContent,
    ACL: "public-read",
    ContentType: "text/plain",
  };

  try {
    const data = await s3.upload(params).promise();
    console.log("File uploaded successfully. URL:", data.Location);
  } catch (err) {
    console.error("Failed to upload:", err);
  }
}

testUpload();
