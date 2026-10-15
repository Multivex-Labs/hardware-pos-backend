const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')
const master = require('../config/masterDb')
const { PLANS } = require('../config/plans')
require('dotenv').config()

const RESERVED = new Set(['www', 'admin', 'api', 'app', 'mail', 'platform'])
const TEMPLATE = path.join(__dirname, '../../sql/tenant_template.sql')

function connect(database) {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 3306,
    database,
    multipleStatements: true
  })
}

const newSecret = () => crypto.randomBytes(48).toString('hex')

// Duka JIPYA: inatengeneza database mpya, schema, admin wa duka, na kuliandikisha kwenye master.
async function provisionTenant(opts) {
  const {
    slug,
    businessName,
    plan = 'starter',
    businessType = 'hardware',
    adminName,
    adminEmail,
    adminPassword,
    trialDays = 14
  } = opts

  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug || '')) {
    throw new Error('Slug si sahihi (a-z, 0-9 na "-", herufi 2 hadi 31)')
  }
  if (RESERVED.has(slug)) throw new Error('Slug hii imehifadhiwa')
  if (!PLANS[plan]) throw new Error(`Plan haipo: ${plan}`)
  if (!businessName) throw new Error('Jina la biashara linahitajika')
  if (!adminEmail || !adminPassword || adminPassword.length < 8) {
    throw new Error('Admin email na password (angalau herufi 8) zinahitajika')
  }
  if (!fs.existsSync(TEMPLATE)) {
    throw new Error('sql/tenant_template.sql haipo. Itengenezwe kwanza kwa mysqldump --no-data.')
  }

  const [exists] = await master.execute('SELECT id FROM tenants WHERE slug = ?', [slug])
  if (exists.length) throw new Error('Slug tayari inatumika')

  const dbName = `mvx_${slug.replace(/-/g, '_')}`
  const subscriptionEnd = new Date(Date.now() + trialDays * 86400000)

  const root = await connect(undefined)
  let created = false
  try {
    await root.query(
      `CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    created = true

    const tdb = await connect(dbName)
    try {
      await tdb.query(fs.readFileSync(TEMPLATE, 'utf8'))
      const [permissionColumns] = await tdb.execute("SHOW COLUMNS FROM users LIKE 'permissions'")
      if (!permissionColumns.length) {
        await tdb.query('ALTER TABLE users ADD COLUMN permissions LONGTEXT NULL AFTER role')
      }
      await tdb.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(100) NOT NULL DEFAULT 'cashier'")
      await tdb.query(`CREATE TABLE IF NOT EXISTS user_roles (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(40) NOT NULL,
        permissions LONGTEXT NOT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY user_roles_name_unique (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
      const hash = await bcrypt.hash(adminPassword, 10)
      await tdb.execute('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
        adminName || 'Admin',
        adminEmail,
        hash,
        'admin'
      ])
      await tdb.execute('INSERT INTO business_settings (business_name) VALUES (?)', [businessName])
    } finally {
      await tdb.end()
    }

    const [r] = await master.execute(
      `INSERT INTO tenants (slug, business_name, db_name, plan, business_type, status, jwt_secret, subscription_end)
       VALUES (?, ?, ?, ?, ?, 'trial', ?, ?)`,
      [slug, businessName, dbName, plan, businessType, newSecret(), subscriptionEnd]
    )

    return {
      id: r.insertId,
      slug,
      dbName,
      plan,
      subscriptionEnd,
      url: `https://${slug}.${process.env.BASE_DOMAIN || 'localhost'}`
    }
  } catch (err) {
    // Kitu kikienda vibaya, ondoa database nusu-nusu ili kujaribu tena kuwe safi
    if (created) await root.query(`DROP DATABASE IF EXISTS \`${dbName}\``).catch(() => {})
    throw err
  } finally {
    await root.end()
  }
}

// Duka lenye database iliyopo tayari (mfano: hardware_pos ya majaribio) - register tu, usiunde DB mpya.
async function registerExistingTenant({
  slug,
  businessName,
  dbName,
  plan = 'business',
  businessType = 'hardware'
}) {
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug || '')) throw new Error('Slug si sahihi')
  if (RESERVED.has(slug)) throw new Error('Slug hii imehifadhiwa')
  if (!PLANS[plan]) throw new Error(`Plan haipo: ${plan}`)

  const [r] = await master.execute(
    `INSERT INTO tenants (slug, business_name, db_name, plan, business_type, status, jwt_secret)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    [slug, businessName, dbName, plan, businessType, newSecret()]
  )
  return { id: r.insertId, slug, dbName }
}

module.exports = { provisionTenant, registerExistingTenant, newSecret }
