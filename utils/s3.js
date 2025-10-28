import { S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.MY_AWS_REGION,            // your Lambda region
  credentials: {
    accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY,
  },
});

export default s3;
