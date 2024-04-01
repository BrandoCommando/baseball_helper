/**
 * Set constants from environment variables
 *
 * @constant  {number}  PORT          The port Express will be using
 * @constant  {string}  ENDPOINT      Our Shopify Admin API endpoint URL
 * @constant  {string}  ACCESS_TOKEN  Our private app access token, for authentication
 */

const fs = require('fs');
const path = require('path');
if (fs.existsSync(path.resolve(__dirname, '.env')))
  require('dotenv').config();

const PORT = process.env.PORT || 8453;
const REDIS_URL = process.env.REDIS_URL || "";

module.exports = {
  PORT,
  REDIS_URL,
}
