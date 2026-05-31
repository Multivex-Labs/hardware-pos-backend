const mysql = require('mysql2/promise')
require('dotenv').config()

// Support both Railway MySQL URL format and individual env vars
let pool

if (process.env.DATABASE_URL) {
  // Railway provides a full MySQL URL
  pool = mysql.createPool(process.env.DATABASE_URL)
} else {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hardware_pos',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  })
}

module.exports = pool
