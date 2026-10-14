const mysql = require('mysql2/promise')
require('dotenv').config()
const tenantContext = require('./tenantContext')

// MULTI_TENANT=true  -> kila request inaenda kwenye database ya tenant wake (angalia tenant middleware)
// MULTI_TENANT haipo -> tabia ile ile ya zamani: database moja (DATABASE_URL au DB_*)
const MULTI_TENANT = process.env.MULTI_TENANT === 'true'

// ---------- MODE YA ZAMANI (single database) - haijabadilika ----------
function buildSinglePool() {
  // Support both Railway MySQL URL format and individual env vars
  if (process.env.DATABASE_URL) {
    // Railway provides a full MySQL URL
    return mysql.createPool(process.env.DATABASE_URL)
  }

  return mysql.createPool({
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

// ---------- MODE YA MULTI-TENANT ----------
const tenantPools = new Map() // dbName -> pool

function getTenantPool(dbName) {
  if (!tenantPools.has(dbName)) {
    tenantPools.set(
      dbName,
      mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: dbName,
        port: process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: Number(process.env.TENANT_POOL_SIZE || 5),
        queueLimit: 0
      })
    )
  }
  return tenantPools.get(dbName)
}

function currentPool() {
  const store = tenantContext.getStore()
  if (!store || !store.dbName) {
    // Hakuna "default database" kwa makusudi, ili data ya duka moja isiingie duka lingine kwa bahati mbaya.
    throw new Error('No tenant context: query imeitwa nje ya request ya tenant')
  }
  return getTenantPool(store.dbName)
}

async function closeAll() {
  await Promise.all([...tenantPools.values()].map((p) => p.end().catch(() => {})))
  tenantPools.clear()
}

// Object hii ina methods zile zile ambazo models zako zinatumia kwenye pool (execute, query, getConnection)
const multiTenantDb = {
  execute: (...args) => currentPool().execute(...args),
  query: (...args) => currentPool().query(...args),
  getConnection: (...args) => currentPool().getConnection(...args),
  getTenantPool,
  closeAll
}

module.exports = MULTI_TENANT ? multiTenantDb : buildSinglePool()
