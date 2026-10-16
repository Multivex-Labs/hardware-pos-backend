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

// Inaendesha hatua moja na kutaja jina lake kama ikishindwa (rahisi ku-debug)
async function step(name, fn) {
  try {
    return await fn()
  } catch (err) {
    err.message = `[${name}] ${err.message}`
    throw err
  }
}

// Duka JIPYA: inatengeneza database mpya, schema, admin wa duka, na kuliandikisha kwenye master.
async function provisionTenant(opts) {
  const {
    slug,
    businessName,
    plan = 'starter',
    billingType = 'monthly',
    businessType = 'hardware',
    adminName,
    adminEmail,
    adminPassword,
    customerContactName,
    customerEmail,
    customerPhone,
    trialDays = 14,
    initialPaymentTzs,
    initialPaymentReference
  } = opts

  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug || '')) {
    throw new Error('Slug si sahihi (a-z, 0-9 na "-", herufi 2 hadi 31)')
  }
  if (RESERVED.has(slug)) throw new Error('Slug hii imehifadhiwa')
  if (!PLANS[plan]) throw new Error(`Plan haipo: ${plan}`)
  if (!['monthly', 'one_time'].includes(billingType)) throw new Error('Billing type is not valid')
  if (!['hardware', 'pharmacy', 'general'].includes(businessType)) throw new Error('Business type is not valid')
  if (!businessName) throw new Error('Jina la biashara linahitajika')
  if (billingType === 'one_time' && (!Number.isSafeInteger(initialPaymentTzs) || initialPaymentTzs < 1)) {
    throw new Error('Enter the full amount received for the one-time package')
  }
  if (billingType === 'one_time' && initialPaymentReference != null &&
      (typeof initialPaymentReference !== 'string' || initialPaymentReference.length > 120)) {
    throw new Error('Payment reference must be 120 characters or fewer')
  }
  if (billingType === 'one_time' && (!customerPhone || customerPhone.trim().length < 5)) {
    throw new Error('A valid customer contact phone number is required')
  }
  if (!adminEmail || !adminPassword || adminPassword.length < 8) {
    throw new Error('Admin email na password (angalau herufi 8) zinahitajika')
  }
  if (!fs.existsSync(TEMPLATE)) {
    throw new Error('sql/tenant_template.sql haipo. Itengenezwe kwanza: node scripts/generateTemplate.js')
  }

  const [exists] = await master.execute('SELECT id FROM tenants WHERE slug = ?', [slug])
  if (exists.length) throw new Error('Slug tayari inatumika')

  const dbName = `mvx_${slug.replace(/-/g, '_')}`
  const subscriptionEnd = billingType === 'monthly' ? new Date(Date.now() + trialDays * 86400000) : null
  const initialStatus = billingType === 'monthly' && trialDays > 0 ? 'trial' : 'active'

  const root = await connect(undefined)
  let created = false
  try {
    await step('create database', () =>
      root.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    )
    created = true

    const tdb = await connect(dbName)
    try {
      await step('apply template', () => tdb.query(fs.readFileSync(TEMPLATE, 'utf8')))

      await step('permissions column', async () => {
        const [permissionColumns] = await tdb.execute("SHOW COLUMNS FROM users LIKE 'permissions'")
        if (!permissionColumns.length) {
          await tdb.query('ALTER TABLE users ADD COLUMN permissions LONGTEXT NULL AFTER role')
        }
      })
      await step('role column', () =>
        tdb.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(100) NOT NULL DEFAULT 'cashier'")
      )
      await step('password rotation column', async () => {
        const [passwordChangeColumns] = await tdb.execute("SHOW COLUMNS FROM users LIKE 'must_change_password'")
        if (!passwordChangeColumns.length) {
          await tdb.query('ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER permissions')
        }
      })
      await step('user_roles table', () =>
        tdb.query(`CREATE TABLE IF NOT EXISTS user_roles (
          id INT NOT NULL AUTO_INCREMENT,
          name VARCHAR(40) NOT NULL,
          permissions LONGTEXT NOT NULL,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY user_roles_name_unique (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
      )

      const hash = await bcrypt.hash(adminPassword, 10)
      await step('insert admin user', () =>
        tdb.execute('INSERT INTO users (name, email, password, role, must_change_password) VALUES (?, ?, ?, ?, 1)', [
          adminName || 'Admin',
          adminEmail,
          hash,
          'admin'
        ])
      )
      // business_settings ni table ya row moja (id = 1), kwa hiyo id inatolewa wazi
      await step('insert business_settings', () =>
        tdb.execute('INSERT INTO business_settings (id, business_name, business_type) VALUES (1, ?, ?)', [businessName, businessType])
      )
    } finally {
      await tdb.end()
    }

    const masterConnection = await master.getConnection()
    let r
    try {
      await masterConnection.beginTransaction()
      const [tenantResult] = await step('register in master (tenants)', () =>
        masterConnection.execute(
        `INSERT INTO tenants (slug, business_name, db_name, plan, billing_type, business_type, status, jwt_secret, subscription_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [slug, businessName, dbName, plan, billingType, businessType, initialStatus, newSecret(), subscriptionEnd]
      )
      )
      r = tenantResult
      if (customerPhone) {
        await step('register platform customer contact', () =>
          masterConnection.execute(
            `INSERT INTO platform_customers
               (tenant_id, customer_type, business_name, contact_name, email, phone, package_name)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              r.insertId,
              billingType === 'one_time' ? 'one_time' : 'local',
              businessName,
              customerContactName || null,
              customerEmail || adminEmail,
              customerPhone,
              plan
            ]
          )
        )
        if (billingType === 'one_time') {
          const [customerRows] = await masterConnection.execute(
            'SELECT id FROM platform_customers WHERE tenant_id = ?',
            [r.insertId]
          )
          await step('record one-time package payment', () =>
            masterConnection.execute(
              `INSERT INTO platform_payments (customer_id, amount_tzs, reference, note)
               VALUES (?, ?, ?, ?)`,
              [customerRows[0].id, initialPaymentTzs, initialPaymentReference?.trim() || null, `One-time ${plan} package purchase`]
            )
          )
        }
      }
      await masterConnection.commit()
    } catch (err) {
      await masterConnection.rollback()
      throw err
    } finally {
      masterConnection.release()
    }

    return {
      id: r.insertId,
      slug,
      dbName,
      plan,
      billingType,
      initialPaymentTzs: billingType === 'one_time' ? initialPaymentTzs : null,
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
