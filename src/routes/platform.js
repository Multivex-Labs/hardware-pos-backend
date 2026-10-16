const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const multer = require('multer')
const master = require('../config/masterDb')
const platformAuth = require('../middleware/platformAuth')
const { clearTenantCache } = require('../middleware/tenant')
const { provisionTenant, newSecret } = require('../services/tenantProvisioner')
const { PLANS, USD_TO_TZS, withUsd } = require('../config/plans')
require('dotenv').config()

const router = express.Router()
const documentStorage = path.resolve(__dirname, '../../storage/platform-documents')
const allowedDocumentTypes = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}
const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => {
      fs.mkdir(documentStorage, { recursive: true }, (err) => callback(err, documentStorage))
    },
    filename: (req, file, callback) => {
      callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
    }
  }),
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase()
    const expectedMime = allowedDocumentTypes[extension]
    if (!expectedMime || (file.mimetype && file.mimetype !== expectedMime)) {
      return callback(new Error('Upload a PDF, DOC, or DOCX document'))
    }
    callback(null, true)
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
})
const parseDocumentUpload = (req, res, next) => {
  documentUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message })
    next()
  })
}

// Express 4 haishiki errors za async yenyewe; wrapper hii inazipeleka kwenye error handler ya server.js
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// POST /api/platform/login
router.post(
  '/login',
  wrap(async (req, res) => {
    const { email, password } = req.body || {}
    const [rows] = await master.execute('SELECT * FROM platform_admins WHERE email = ?', [email])
    const admin = rows[0]

    if (!admin || !(await bcrypt.compare(password || '', admin.password))) {
      return res.status(401).json({ message: 'Email au password si sahihi' })
    }

    const token = jwt.sign({ id: admin.id, scope: 'platform' }, process.env.PLATFORM_JWT_SECRET, {
      expiresIn: '8h'
    })
    res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } })
  })
)

// Kuanzia hapa chini kila kitu kinahitaji platform token
router.use(platformAuth)

router.get(
  '/documents',
  wrap(async (req, res) => {
    const [documents] = await master.execute(
      `SELECT id, category, display_name, original_name, mime_type, file_size, uploaded_at
       FROM platform_documents ORDER BY uploaded_at DESC, id DESC`
    )
    res.json(documents)
  })
)

router.post(
  '/documents',
  parseDocumentUpload,
  wrap(async (req, res) => {
    const { category } = req.body || {}
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : ''
    if (!['invoice_template', 'pos_contract'].includes(category)) {
      if (req.file) await fs.promises.unlink(req.file.path)
      return res.status(400).json({ message: 'Choose an invoice template or POS contract' })
    }
    if (!displayName || displayName.length > 160) {
      if (req.file) await fs.promises.unlink(req.file.path)
      return res.status(400).json({ message: 'Document name is required and must be 160 characters or fewer' })
    }
    if (!req.file) return res.status(400).json({ message: 'Choose a document file to upload' })

    const originalName = req.file.originalname.replace(/^.*[\\/]/, '').slice(0, 255)
    try {
      const [result] = await master.execute(
        `INSERT INTO platform_documents
           (category, display_name, original_name, storage_name, mime_type, file_size)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [category, displayName, originalName, path.basename(req.file.filename), req.file.mimetype, req.file.size]
      )
      res.status(201).json({ id: result.insertId })
    } catch (err) {
      try {
        await fs.promises.unlink(req.file.path)
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') console.error('Could not remove failed document upload:', cleanupError.message)
      }
      throw err
    }
  })
)

router.get(
  '/documents/:id/download',
  wrap(async (req, res, next) => {
    const id = Number(req.params.id)
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Document reference is not valid' })
    const [rows] = await master.execute(
      'SELECT original_name, storage_name FROM platform_documents WHERE id = ?',
      [id]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Document not found' })
    const documentPath = path.resolve(documentStorage, rows[0].storage_name)
    if (path.dirname(documentPath) !== documentStorage) {
      return res.status(500).json({ message: 'Stored document path is not valid' })
    }
    try {
      await fs.promises.access(documentPath, fs.constants.R_OK)
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ message: 'Document file is missing from storage' })
      throw err
    }
    res.download(documentPath, rows[0].original_name, (err) => {
      if (err) next(err)
    })
  })
)

// GET /api/platform/tenants
router.get(
  '/tenants',
  wrap(async (req, res) => {
    const [rows] = await master.execute(
      `SELECT id, slug, business_name, db_name, plan, billing_type, business_type, status, subscription_end, created_at
       FROM tenants WHERE billing_type = 'monthly' ORDER BY created_at DESC`
    )
    res.json(rows.map((t) => ({ ...t, price: withUsd(PLANS[t.plan]?.monthlyTzs || 0) })))
  })
)

// POST /api/platform/tenants  (tengeneza duka jipya)
router.post(
  '/tenants',
  wrap(async (req, res) => {
    try {
      const body = req.body || {}
      const customerPhone = typeof body.customerPhone === 'string' ? body.customerPhone.trim() : ''
      if (customerPhone.length < 5 || customerPhone.length > 40) {
        return res.status(400).json({ message: 'A valid customer contact phone number is required' })
      }
      if (body.customerContactName && (typeof body.customerContactName !== 'string' || body.customerContactName.length > 120)) {
        return res.status(400).json({ message: 'Customer contact name must be 120 characters or fewer' })
      }
      if (body.customerEmail && (typeof body.customerEmail !== 'string' || body.customerEmail.length > 190)) {
        return res.status(400).json({ message: 'Customer email must be 190 characters or fewer' })
      }
      const billingType = body.billingType || 'monthly'
      if (!['monthly', 'one_time'].includes(billingType)) {
        return res.status(400).json({ message: 'Billing type is not valid' })
      }
      if (billingType === 'one_time') {
        const amount = Number(body.initialPaymentTzs)
        if (
          (typeof body.initialPaymentTzs !== 'number' && typeof body.initialPaymentTzs !== 'string') ||
          String(body.initialPaymentTzs).trim() === '' ||
          !Number.isSafeInteger(amount) ||
          amount < 1
        ) {
          return res.status(400).json({ message: 'Enter the full amount received for the one-time package' })
        }
        body.initialPaymentTzs = amount
        if (body.initialPaymentReference !== undefined && body.initialPaymentReference !== null &&
            (typeof body.initialPaymentReference !== 'string' || body.initialPaymentReference.length > 120)) {
          return res.status(400).json({ message: 'Payment reference must be 120 characters or fewer' })
        }
      }
      const created = await provisionTenant({ ...body, customerPhone })
      res.status(201).json(created)
    } catch (err) {
      res.status(400).json({ message: err.message })
    }
  })
)

// PATCH /api/platform/tenants/:id/status   { status: 'active' | 'trial' | 'suspended' | 'cancelled' }
router.patch(
  '/tenants/:id/status',
  wrap(async (req, res) => {
    const { status } = req.body || {}
    if (!['active', 'trial', 'suspended', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Status si sahihi' })
    }

    const [rows] = await master.execute('SELECT slug FROM tenants WHERE id = ?', [req.params.id])
    if (!rows[0]) return res.status(404).json({ message: 'Duka halipo' })

    await master.execute('UPDATE tenants SET status = ? WHERE id = ?', [status, req.params.id])
    clearTenantCache(rows[0].slug)
    res.json({ ok: true })
  })
)

router.patch(
  '/tenants/:id/business-type',
  wrap(async (req, res) => {
    const tenantId = Number(req.params.id)
    const { businessType } = req.body || {}
    if (!Number.isSafeInteger(tenantId) || tenantId < 1) {
      return res.status(400).json({ message: 'Tenant reference is not valid' })
    }
    if (!['hardware', 'pharmacy', 'general'].includes(businessType)) {
      return res.status(400).json({ message: 'Business type is not valid' })
    }

    const connection = await master.getConnection()
    let slug
    try {
      await connection.beginTransaction()
      const [rows] = await connection.execute(
        'SELECT slug, db_name FROM tenants WHERE id = ? FOR UPDATE',
        [tenantId]
      )
      if (!rows[0]) {
        await connection.rollback()
        return res.status(404).json({ message: 'Shop not found' })
      }
      if (typeof rows[0].db_name !== 'string' || !/^[a-zA-Z0-9_]+$/.test(rows[0].db_name)) {
        throw new Error('Tenant database name is invalid')
      }

      const tenantDatabase = `\`${rows[0].db_name}\``
      const [settings] = await connection.execute(
        `SELECT id FROM ${tenantDatabase}.business_settings WHERE id = 1`
      )
      if (!settings[0]) throw new Error('Shop business settings are missing')

      await connection.execute(
        'UPDATE tenants SET business_type = ? WHERE id = ?',
        [businessType, tenantId]
      )
      await connection.execute(
        `UPDATE ${tenantDatabase}.business_settings SET business_type = ? WHERE id = 1`,
        [businessType]
      )
      await connection.commit()
      slug = rows[0].slug
    } catch (err) {
      await connection.rollback()
      throw err
    } finally {
      connection.release()
    }

    clearTenantCache(slug)
    res.json({ ok: true, businessType })
  })
)

router.get(
  '/customers',
  wrap(async (req, res) => {
    const [tenants] = await master.execute(
      `SELECT CONCAT(t.billing_type, '-', t.id) AS id,
              CASE WHEN t.billing_type = 'one_time' THEN 'one_time' ELSE 'saas' END AS customer_type,
              t.billing_type, t.id AS tenant_id,
              pc.id AS profile_id, t.business_name, COALESCE(pc.contact_name, '') AS contact_name,
              COALESCE(pc.email, '') AS email, COALESCE(pc.phone, '') AS phone,
              COALESCE(pc.package_name, t.plan) AS package_name, COALESCE(pc.notes, '') AS notes,
              t.status, t.subscription_end, t.created_at, t.plan, t.business_type, t.slug, t.db_name
       FROM tenants t LEFT JOIN platform_customers pc ON pc.tenant_id = t.id
       ORDER BY t.created_at DESC`
    )
    const [localCustomers] = await master.execute(
      `SELECT CONCAT(customer_type, '-', id) AS id, customer_type, NULL AS tenant_id,
              id AS profile_id, business_name, contact_name, email, phone, package_name, notes,
              status, NULL AS subscription_end, created_at, NULL AS plan, NULL AS billing_type, NULL AS business_type,
              NULL AS slug, NULL AS db_name
       FROM platform_customers WHERE tenant_id IS NULL AND customer_type = 'local'
       ORDER BY created_at DESC`
    )
    res.json([...tenants, ...localCustomers])
  })
)

router.post(
  '/customers',
  wrap(async (req, res) => {
    const body = req.body || {}
    const customerType = body.customerType || 'local'
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    if (customerType !== 'local') {
      return res.status(400).json({ message: 'Online one-time customers must be created as hosted shops' })
    }
    if (!businessName || businessName.length > 160) {
      return res.status(400).json({ message: 'Business name is required and must be 160 characters or fewer' })
    }
    if (phone.length < 5 || phone.length > 40) {
      return res.status(400).json({ message: 'A valid contact phone number is required' })
    }
    if (body.email && (typeof body.email !== 'string' || body.email.length > 190)) {
      return res.status(400).json({ message: 'Email must be 190 characters or fewer' })
    }
    if (body.contactName !== undefined && body.contactName !== null && typeof body.contactName !== 'string') {
      return res.status(400).json({ message: 'Contact name must be text' })
    }
    if (body.packageName !== undefined && body.packageName !== null && typeof body.packageName !== 'string') {
      return res.status(400).json({ message: 'Package name must be text' })
    }
    if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string') {
      return res.status(400).json({ message: 'Customer notes must be text' })
    }
    if (body.status && !['active', 'prospect', 'inactive'].includes(body.status)) {
      return res.status(400).json({ message: 'Customer status is not valid' })
    }
    const [result] = await master.execute(
      `INSERT INTO platform_customers
         (customer_type, business_name, contact_name, email, phone, package_name, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerType,
        businessName,
        typeof body.contactName === 'string' ? body.contactName.trim() || null : null,
        typeof body.email === 'string' ? body.email.trim() || null : null,
        phone,
        typeof body.packageName === 'string' ? body.packageName.trim() || null : null,
        typeof body.notes === 'string' ? body.notes.trim() || null : null,
        body.status || 'active'
      ]
    )
    res.status(201).json({ id: result.insertId })
  })
)

router.patch(
  '/customers/:type/:id',
  wrap(async (req, res) => {
    const { type } = req.params
    const id = Number(req.params.id)
    const body = req.body || {}
    if (!['local', 'one_time', 'saas'].includes(type) || !Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ message: 'Customer reference is not valid' })
    }
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    if (!businessName || businessName.length > 160 || phone.length < 5 || phone.length > 40) {
      return res.status(400).json({ message: 'Business name and a valid contact phone number are required' })
    }
    if (body.email && (typeof body.email !== 'string' || body.email.length > 190)) {
      return res.status(400).json({ message: 'Email must be 190 characters or fewer' })
    }
    if (body.contactName !== undefined && body.contactName !== null && typeof body.contactName !== 'string') {
      return res.status(400).json({ message: 'Contact name must be text' })
    }
    if (body.packageName !== undefined && body.packageName !== null && typeof body.packageName !== 'string') {
      return res.status(400).json({ message: 'Package name must be text' })
    }
    if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string') {
      return res.status(400).json({ message: 'Customer notes must be text' })
    }
    if (body.status && !['active', 'prospect', 'inactive'].includes(body.status)) {
      return res.status(400).json({ message: 'Customer status is not valid' })
    }
    const values = [
      businessName,
      typeof body.contactName === 'string' ? body.contactName.trim() || null : null,
      typeof body.email === 'string' ? body.email.trim() || null : null,
      phone,
      typeof body.packageName === 'string' ? body.packageName.trim() || null : null,
      typeof body.notes === 'string' ? body.notes.trim() || null : null
    ]

    if (type === 'saas' || type === 'one_time') {
      const billingType = type === 'saas' ? 'monthly' : 'one_time'
      const [rows] = await master.execute(
        'SELECT id, slug, db_name FROM tenants WHERE id = ? AND billing_type = ?',
        [id, billingType]
      )
      if (!rows[0]) return res.status(404).json({ message: 'Shop not found' })
      if (!/^[a-zA-Z0-9_]+$/.test(rows[0].db_name)) {
        throw new Error('Stored tenant database name is not valid')
      }
      const tenantDatabase = `\`${rows[0].db_name}\``
      const connection = await master.getConnection()
      try {
        await connection.beginTransaction()
        await connection.execute('UPDATE tenants SET business_name = ? WHERE id = ?', [businessName, id])
        await connection.execute(
          `INSERT INTO platform_customers (tenant_id, business_name, contact_name, email, phone, package_name, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE business_name = VALUES(business_name),
             contact_name = VALUES(contact_name), email = VALUES(email), phone = VALUES(phone),
             package_name = VALUES(package_name), notes = VALUES(notes)`,
          [id, ...values]
        )
        await connection.execute(
          `UPDATE ${tenantDatabase}.business_settings SET business_name = ? WHERE id = 1`,
          [businessName]
        )
        await connection.commit()
      } catch (err) {
        await connection.rollback()
        throw err
      } finally {
        connection.release()
      }
      clearTenantCache(rows[0].slug)
    } else {
      const [result] = await master.execute(
        `UPDATE platform_customers SET business_name = ?, contact_name = ?, email = ?, phone = ?,
           package_name = ?, notes = ?, status = COALESCE(?, status)
         WHERE id = ? AND tenant_id IS NULL AND customer_type = ?`,
        [...values, body.status || null, id, type]
      )
      if (!result.affectedRows) return res.status(404).json({ message: 'Customer not found' })
    }
    res.json({ ok: true })
  })
)

router.get(
  '/customers/:type/:id/payments',
  wrap(async (req, res) => {
    const { type } = req.params
    const id = Number(req.params.id)
    if (!['local', 'one_time', 'saas'].includes(type) || !Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ message: 'Customer reference is not valid' })
    }
    const table = type === 'saas' ? 'tenant_payments' : 'platform_payments'
    const key = type === 'saas' ? 'tenant_id' : 'customer_id'
    const [rows] = await master.execute(
      `SELECT id, amount_tzs, reference, ${type === 'saas' ? 'months' : 'note'}, paid_at
       FROM ${table} WHERE ${key} = ? ORDER BY paid_at DESC, id DESC LIMIT 100`,
      [id]
    )
    const [[summary]] = await master.execute(
      `SELECT COALESCE(SUM(amount_tzs), 0) AS total_received FROM ${table} WHERE ${key} = ?`,
      [id]
    )
    res.json({ payments: rows, totalReceived: Number(summary.total_received) })
  })
)

router.post(
  '/customers/:type/:id/payments',
  wrap(async (req, res) => {
    const { type } = req.params
    const customerId = Number(req.params.id)
    const body = req.body || {}
    const amountInput = typeof body.amountTzs === 'string' ? body.amountTzs.trim() : body.amountTzs
    const amount = Number(amountInput)
    if (!['local', 'one_time'].includes(type) || !Number.isSafeInteger(customerId) || customerId < 1) {
      return res.status(400).json({ message: 'Customer reference is not valid' })
    }
    if (
      (typeof body.amountTzs !== 'number' && typeof body.amountTzs !== 'string') ||
      amountInput === '' ||
      !Number.isSafeInteger(amount) ||
      amount < 1
    ) {
      return res.status(400).json({ message: 'Payment must be a positive whole number of TSh' })
    }
    if (body.reference !== undefined && body.reference !== null && typeof body.reference !== 'string') {
      return res.status(400).json({ message: 'Payment reference must be text' })
    }
    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
      return res.status(400).json({ message: 'Payment note must be text' })
    }
    const reference = typeof body.reference === 'string' ? body.reference.trim() || null : null
    const note = typeof body.note === 'string' ? body.note.trim() || null : null
    const [customers] = await master.execute(
      `SELECT id FROM platform_customers
       WHERE id = ? AND ${type === 'one_time' ? 'tenant_id IS NOT NULL' : 'tenant_id IS NULL'}
         AND customer_type = ?`,
      [customerId, type]
    )
    if (!customers[0]) return res.status(404).json({ message: 'Local customer not found' })
    const [result] = await master.execute(
      'INSERT INTO platform_payments (customer_id, amount_tzs, reference, note) VALUES (?, ?, ?, ?)',
      [customerId, amount, reference, note]
    )
    res.status(201).json({ id: result.insertId, amountTzs: amount })
  })
)

// POST /api/platform/tenants/:id/extend   { months, amountTzs, reference }
router.post(
  '/tenants/:id/extend',
  wrap(async (req, res) => {
    const body = req.body || {}
    const hasMonths = body.months !== undefined && body.months !== null
    const months = hasMonths ? Number(body.months) : 1
    if (
      (hasMonths && typeof body.months !== 'number' && typeof body.months !== 'string') ||
      !Number.isInteger(months) ||
      months < 1 ||
      months > 24
    ) {
      return res.status(400).json({ message: 'Months must be a whole number between 1 and 24' })
    }

    if (body.reference !== undefined && body.reference !== null && typeof body.reference !== 'string') {
      return res.status(400).json({ message: 'Payment reference must be text' })
    }
    const reference = typeof body.reference === 'string' ? body.reference.trim() || null : null

    const [rows] = await master.execute('SELECT * FROM tenants WHERE id = ?', [req.params.id])
    const tenant = rows[0]
    if (!tenant) return res.status(404).json({ message: 'Duka halipo' })
    if (tenant.billing_type !== 'monthly') {
      return res.status(400).json({ message: 'One-time online packages do not have monthly renewals' })
    }

    const hasAmount = body.amountTzs !== undefined && body.amountTzs !== null
    const amountInput = typeof body.amountTzs === 'string' ? body.amountTzs.trim() : body.amountTzs
    const amount = hasAmount ? Number(amountInput) : NaN
    if (
      hasAmount &&
      ((typeof body.amountTzs !== 'number' && typeof body.amountTzs !== 'string') ||
        amountInput === '' ||
        !Number.isSafeInteger(amount) ||
        amount < 1)
    ) {
      return res.status(400).json({ message: 'Enter the positive whole-number amount received in TSh' })
    }
    if (!hasAmount) return res.status(400).json({ message: 'Actual amount received is required' })

    // Kama bado ana siku, ongeza juu ya tarehe ya mwisho; kama imeisha, anza leo
    const base =
      tenant.subscription_end && new Date(tenant.subscription_end) > new Date()
        ? new Date(tenant.subscription_end)
        : new Date()
    base.setMonth(base.getMonth() + months)

    const connection = await master.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('UPDATE tenants SET subscription_end = ?, status = ? WHERE id = ?', [
        base,
        'active',
        tenant.id
      ])
      await connection.execute(
        'INSERT INTO tenant_payments (tenant_id, amount_tzs, months, reference) VALUES (?, ?, ?, ?)',
        [tenant.id, amount, months, reference]
      )
      await connection.commit()
    } catch (err) {
      await connection.rollback()
      throw err
    } finally {
      connection.release()
    }

    clearTenantCache(tenant.slug)
    res.json({ subscription_end: base, paid: withUsd(amount) })
  })
)

// POST /api/platform/tenants/:id/rotate-secret   (users wote wa duka hilo wanalazimika kuingia upya)
router.post(
  '/tenants/:id/rotate-secret',
  wrap(async (req, res) => {
    const [rows] = await master.execute('SELECT slug FROM tenants WHERE id = ?', [req.params.id])
    if (!rows[0]) return res.status(404).json({ message: 'Duka halipo' })

    await master.execute('UPDATE tenants SET jwt_secret = ? WHERE id = ?', [
      newSecret(),
      req.params.id
    ])
    clearTenantCache(rows[0].slug)
    res.json({ ok: true, note: 'Users wote wa duka hili wataingia upya' })
  })
)

// GET /api/platform/stats
router.get(
  '/stats',
  wrap(async (req, res) => {
    const [rows] = await master.execute("SELECT plan, status FROM tenants WHERE billing_type = 'monthly'")
    const active = rows.filter((r) => r.status === 'active')
    const [[tenantPayments]] = await master.execute(
      `SELECT COALESCE(SUM(amount_tzs), 0) AS total,
              COALESCE(SUM(CASE WHEN paid_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
                                 AND paid_at < DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH)
                                THEN amount_tzs ELSE 0 END), 0) AS this_month
       FROM tenant_payments`
    )
    const [[localPayments]] = await master.execute(
      `SELECT COALESCE(SUM(amount_tzs), 0) AS total,
              COALESCE(SUM(CASE WHEN paid_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
                                 AND paid_at < DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH)
                                THEN amount_tzs ELSE 0 END), 0) AS this_month
       FROM platform_payments`
    )
    const [expiryRows] = await master.execute(
      `SELECT
         SUM(subscription_end > NOW() AND subscription_end <= DATE_ADD(NOW(), INTERVAL 30 DAY)) AS expiring30,
         SUM(subscription_end > NOW() AND subscription_end <= DATE_ADD(NOW(), INTERVAL 7 DAY)) AS expiring7
       FROM tenants WHERE billing_type = 'monthly'`
    )
    const total = Number(tenantPayments.total) + Number(localPayments.total)
    const thisMonth = Number(tenantPayments.this_month) + Number(localPayments.this_month)

    res.json({
      totalTenants: rows.length,
      active: active.length,
      trial: rows.filter((r) => r.status === 'trial').length,
      suspended: rows.filter((r) => r.status === 'suspended').length,
      expiring30: Number(expiryRows[0].expiring30 || 0),
      expiring7: Number(expiryRows[0].expiring7 || 0),
      totalReceived: withUsd(total),
      receivedThisMonth: withUsd(thisMonth),
      rate: `1 USD = TSh ${USD_TO_TZS.toLocaleString('en-US')}`
    })
  })
)

module.exports = router
