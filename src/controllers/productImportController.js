const db = require('../config/database')
const BusinessSettings = require('../models/businessSettings')

// Bulk product import (Excel/CSV rows zinatumwa kama JSON kutoka frontend).
// - preview: haiandiki chochote, inarudisha kila row ni OK / Duplicate / Error
// - importProducts: inarudia validation upande wa server (hatuamini client),
//   kisha inaingiza rows zote OK kwenye transaction moja (zote au hakuna).
// Stock ya mwanzo inaandikwa pia kwenye stock_movements (opening stock) ili history ibaki sahihi.

const MAX_ROWS = 2000
const MAX_MONEY = 99999999
const UNITS = ['PC', 'KG', 'L', 'M', 'M2', 'BAG', 'BOX', 'ROLL', 'PAIR', 'SET', 'TIN', 'BTL']
const UNIT_ALIASES = {
  PCS: 'PC', PIECE: 'PC', PIECES: 'PC', KGS: 'KG', KILO: 'KG', KILOS: 'KG',
  LTR: 'L', LTRS: 'L', LITRE: 'L', LITRES: 'L', LITER: 'L', LITERS: 'L',
  METER: 'M', METRE: 'M', METERS: 'M', METRES: 'M', BAGS: 'BAG', BOXES: 'BOX',
  ROLLS: 'ROLL', PAIRS: 'PAIR', SETS: 'SET', TINS: 'TIN', BOTTLE: 'BTL', BOTTLES: 'BTL'
}

const text = (v, max) => {
  if (v === undefined || v === null) return null
  const s = String(v).trim().replace(/\s+/g, ' ')
  return s === '' ? null : s.slice(0, max)
}

// "18,500" -> 18500, "" -> null (haikuwekwa), "abc" -> NaN (error)
const toNumber = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null
  const n = Number(String(v).replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : NaN
}

const money = (label, raw, { required = false, errors }) => {
  const n = toNumber(raw)
  if (n === null) {
    if (required) errors.push(`${label} is required`)
    return null
  }
  if (Number.isNaN(n)) { errors.push(`${label} must be a number`); return null }
  if (n < 0) { errors.push(`${label} cannot be negative`); return null }
  if (n > MAX_MONEY) { errors.push(`${label} is too large`); return null }
  return Math.round(n * 100) / 100
}

function normalizeRow(raw, index) {
  const errors = []
  const warnings = []
  const r = raw && typeof raw === 'object' ? raw : {}

  const name = text(r.name, 150)
  if (!name) errors.push('Product name is required')

  const price = money('Price', r.price, { required: true, errors })
  const wholesale = money('Wholesale price', r.wholesale_price, { errors })
  const cost = money('Cost price', r.cost_price, { errors })
  const stockRaw = toNumber(r.stock)
  let stock = 0
  if (stockRaw !== null) {
    if (Number.isNaN(stockRaw)) errors.push('Stock must be a number')
    else if (stockRaw < 0) errors.push('Stock cannot be negative')
    else if (stockRaw > MAX_MONEY) errors.push('Stock is too large')
    else stock = Math.round(stockRaw * 1000) / 1000
  }
  const alertRaw = toNumber(r.low_stock_alert)
  let lowStockAlert = 5
  if (alertRaw !== null) {
    if (Number.isNaN(alertRaw) || alertRaw < 0) errors.push('Low stock alert must be a positive number')
    else lowStockAlert = alertRaw
  }

  let unit = text(r.unit, 20)
  if (!unit) unit = 'PC'
  else {
    unit = unit.toUpperCase()
    unit = UNIT_ALIASES[unit] || unit
    if (!UNITS.includes(unit)) errors.push(`Unit "${unit}" is not supported (use ${UNITS.join(', ')})`)
  }

  if (errors.length === 0) {
    if (cost !== null && price !== null && cost > price) warnings.push('Cost price is higher than selling price (negative margin)')
    if (cost === null) warnings.push('No cost price, profit reports will treat cost as 0')
    if (wholesale !== null && price !== null && wholesale > price) warnings.push('Wholesale price is higher than retail price')
  }

  return {
    row: Number(r.__row) > 0 ? Number(r.__row) : index + 2, // namba ya row kwenye Excel (row 1 = headers)
    errors,
    warnings,
    data: {
      name,
      description: text(r.description, 500),
      category: text(r.category, 100),
      unit,
      price,
      wholesale_price: wholesale,
      cost_price: cost === null ? 0 : cost,
      stock,
      low_stock_alert: lowStockAlert,
      shelf: text(r.shelf, 50)
    }
  }
}

async function assertNotPharmacy() {
  const settings = await BusinessSettings.get()
  if (settings?.business_type === 'pharmacy') {
    const err = new Error('Excel import for pharmacy needs batch number and expiry date per medicine. It is not available yet, add medicines through New product or Procurement.')
    err.status = 400
    throw err
  }
}

async function analyze(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    const err = new Error('No rows received. Check that your file has data under the header row.')
    err.status = 400
    throw err
  }
  if (rows.length > MAX_ROWS) {
    const err = new Error(`Too many rows (${rows.length}). Import up to ${MAX_ROWS} products at a time, split the file into parts.`)
    err.status = 400
    throw err
  }

  const [existing] = await db.execute('SELECT LOWER(name) AS n FROM products WHERE is_active = 1')
  const inDb = new Set(existing.map(e => e.n))
  const seenInFile = new Set()

  return rows.map((raw, i) => {
    const item = normalizeRow(raw, i)
    if (item.errors.length) return { ...item, status: 'error' }
    const key = item.data.name.toLowerCase()
    if (inDb.has(key)) return { ...item, status: 'duplicate', reason: 'A product with this name already exists' }
    if (seenInFile.has(key)) return { ...item, status: 'duplicate', reason: 'Repeated earlier in this file' }
    seenInFile.add(key)
    return { ...item, status: 'ok' }
  })
}

const summarize = (items) => ({
  total: items.length,
  ok: items.filter(i => i.status === 'ok').length,
  duplicates: items.filter(i => i.status === 'duplicate').length,
  errors: items.filter(i => i.status === 'error').length,
  warnings: items.filter(i => i.status === 'ok' && i.warnings.length).length
})

const productImportController = {
  async preview(req, res, next) {
    try {
      await assertNotPharmacy()
      const items = await analyze(req.body?.rows)
      res.json({ summary: summarize(items), items })
    } catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message })
      next(error)
    }
  },

  async importProducts(req, res, next) {
    let conn
    try {
      await assertNotPharmacy()
      const items = await analyze(req.body?.rows)
      const toInsert = items.filter(i => i.status === 'ok')
      const summary = summarize(items)

      if (toInsert.length === 0) {
        return res.status(400).json({ message: 'Nothing to import. Every row is a duplicate or has an error.', summary })
      }

      conn = await db.getConnection()
      await conn.beginTransaction()

      let historyFailed = 0
      for (const { data } of toInsert) {
        const [result] = await conn.execute(
          `INSERT INTO products
            (name, description, price, wholesale_price, cost_price, stock, unit, low_stock_alert, category, shelf)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [data.name, data.description, data.price, data.wholesale_price, data.cost_price, data.stock,
            data.unit, data.low_stock_alert, data.category, data.shelf]
        )

        if (data.stock > 0) {
          try {
            await conn.execute(
              `INSERT INTO stock_movements
                (product_id, movement_type, quantity_change, stock_before, stock_after, reference_type, reason, performed_by)
               VALUES (?, 'adjustment', ?, 0, ?, 'product_import', 'Opening stock (Excel import)', ?)`,
              [result.insertId, data.stock, data.stock, req.user?.id || null]
            )
          } catch (historyError) {
            if (historyFailed === 0) console.warn('Product import: stock history insert failed:', historyError.message)
            historyFailed++
          }
        }
      }

      await conn.commit()
      res.status(201).json({
        message: `${toInsert.length} products imported`,
        imported: toInsert.length,
        skipped_duplicates: summary.duplicates,
        rejected: summary.errors,
        stock_history_missing: historyFailed
      })
    } catch (error) {
      if (conn) { try { await conn.rollback() } catch (_) { /* ignore */ } }
      if (error.status) return res.status(error.status).json({ message: error.message })
      next(error)
    } finally {
      if (conn) conn.release()
    }
  }
}

module.exports = productImportController
module.exports._test = { normalizeRow }
