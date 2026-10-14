const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const master = require('../config/masterDb')
const platformAuth = require('../middleware/platformAuth')
const { clearTenantCache } = require('../middleware/tenant')
const { provisionTenant, newSecret } = require('../services/tenantProvisioner')
const { PLANS, USD_TO_TZS, withUsd } = require('../config/plans')
require('dotenv').config()

const router = express.Router()

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

// GET /api/platform/tenants
router.get(
  '/tenants',
  wrap(async (req, res) => {
    const [rows] = await master.execute(
      `SELECT id, slug, business_name, db_name, plan, business_type, status, subscription_end, created_at
       FROM tenants ORDER BY created_at DESC`
    )
    res.json(rows.map((t) => ({ ...t, price: withUsd(PLANS[t.plan]?.monthlyTzs || 0) })))
  })
)

// POST /api/platform/tenants  (tengeneza duka jipya)
router.post(
  '/tenants',
  wrap(async (req, res) => {
    try {
      res.status(201).json(await provisionTenant(req.body || {}))
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

// POST /api/platform/tenants/:id/extend   { months, amountTzs, reference }
router.post(
  '/tenants/:id/extend',
  wrap(async (req, res) => {
    const months = Number((req.body || {}).months || 1)
    const [rows] = await master.execute('SELECT * FROM tenants WHERE id = ?', [req.params.id])
    const tenant = rows[0]
    if (!tenant) return res.status(404).json({ message: 'Duka halipo' })

    // Kama bado ana siku, ongeza juu ya tarehe ya mwisho; kama imeisha, anza leo
    const base =
      tenant.subscription_end && new Date(tenant.subscription_end) > new Date()
        ? new Date(tenant.subscription_end)
        : new Date()
    base.setMonth(base.getMonth() + months)

    const amount = Number(req.body.amountTzs || (PLANS[tenant.plan]?.monthlyTzs || 0) * months)

    await master.execute('UPDATE tenants SET subscription_end = ?, status = ? WHERE id = ?', [
      base,
      'active',
      tenant.id
    ])
    await master.execute(
      'INSERT INTO tenant_payments (tenant_id, amount_tzs, months, reference) VALUES (?, ?, ?, ?)',
      [tenant.id, amount, months, req.body.reference || null]
    )

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
    const [rows] = await master.execute('SELECT plan, status FROM tenants')
    const active = rows.filter((r) => r.status === 'active')
    const mrrTzs = active.reduce((sum, r) => sum + (PLANS[r.plan]?.monthlyTzs || 0), 0)

    res.json({
      totalTenants: rows.length,
      active: active.length,
      trial: rows.filter((r) => r.status === 'trial').length,
      suspended: rows.filter((r) => r.status === 'suspended').length,
      mrr: withUsd(mrrTzs),
      rate: `1 USD = TSh ${USD_TO_TZS.toLocaleString('en-US')}`
    })
  })
)

module.exports = router
