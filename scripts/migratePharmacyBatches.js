const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
require('dotenv').config()

const migration = fs.readFileSync(path.join(__dirname, '../src/migrations/008_pharmacy_batches.sql'), 'utf8')
const connectionOptions = (database) => ({
  host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '', port: Number(process.env.DB_PORT || 3306),
  database, multipleStatements: true
})

async function main() {
  let databases
  if (process.env.MULTI_TENANT === 'true') {
    const master = await mysql.createConnection(connectionOptions(process.env.MASTER_DB_NAME || 'multivex_master'))
    try {
      const [tenants] = await master.execute("SELECT db_name FROM tenants WHERE status <> 'cancelled'")
      databases = tenants.map(t => t.db_name)
    } finally { await master.end() }
  } else {
    databases = [process.env.DB_NAME || 'hardware_pos']
  }
  if (!databases.length) { console.log('No tenant databases found.'); return }
  for (const database of databases) {
    const connection = await mysql.createConnection(connectionOptions(database))
    try { await connection.query(migration); console.log(`Pharmacy batch migration applied: ${database}`) }
    catch (error) { console.error(`Migration failed for ${database}: ${error.message}`); process.exitCode = 1 }
    finally { await connection.end() }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
