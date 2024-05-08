/**
 * Set constants from environment variables
 *
 * @constant  {number}  PORT          The port Express will be using
 * @constant  {string}  REDIS_URL     Redis connection string for cache
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
