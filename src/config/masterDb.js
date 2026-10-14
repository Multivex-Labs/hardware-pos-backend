// Master DB: orodha ya maduka (tenants), subscriptions na platform admins.
const mysql = require('mysql2/promise')
require('dotenv').config()

const master = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.MASTER_DB_NAME || 'multivex_master',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
})

module.exports = master
