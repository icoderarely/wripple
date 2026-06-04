const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),

  DB: z.string(),
  ACCESS_TOKEN_KEY: z.string(),
  REFRESH_TOKEN_KEY: z.string(),

  AWS_EMAIL: z.string(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  AWS_REGION: z.string(),
  AWS_BUCKET_NAME: z.string(),
  AWS_CDN_URL: z.string(),
  CLOUDFRONT_KEY_PAIR_ID: z.string(),
  CLOUDFRONT_PRIVATE_KEY_PATH: z.string(),
  CLOUDFRONT_DISTRIBUTION_ID: z.string(),
});

module.exports = schema.parse(process.env);
