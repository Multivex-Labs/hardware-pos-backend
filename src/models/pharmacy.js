const db = require('../config/database')
const StockMovement = require('./stockMovement')
const crypto = require('crypto')

const Pharmacy = {
  async listPrescriptions({ status = 'open' } = {}) {
    const statusClause = status === 'all' ? '' : status === 'open' ? "WHERE r.status IN ('pending','in_progress','partially_dispensed')" : 'WHERE r.status=?'
    const [headers] = await db.execute(`SELECT r.id,r.prescription_number,r.patient_name,r.patient_reference,r.prescriber_name,r.prescription_date,r.status,r.notes,r.created_at,u.name AS created_by_name FROM pharmacy_prescriptions r LEFT JOIN users u ON u.id=r.created_by ${statusClause} ORDER BY r.created_at DESC LIMIT 200`, statusClause && status !== 'open' ? [status] : [])
    if (!headers.length) return []
    const ids = headers.map(row => row.id)
    const [items] = await db.execute(`SELECT i.*,p.name AS product_name,p.unit,r.prescription_number,r.patient_name,r.prescriber_name,r.prescription_date FROM pharmacy_prescription_items i JOIN products p ON p.id=i.product_id JOIN pharmacy_prescriptions r ON r.id=i.prescription_id WHERE i.prescription_id IN (${ids.map(() => '?').join(',')}) ORDER BY i.id`, ids)
    const byPrescription = new Map()
    for (const item of items) {
      if (!byPrescription.has(Number(item.prescription_id))) byPrescription.set(Number(item.prescription_id), [])
      byPrescription.get(Number(item.prescription_id)).push(item)
    }
    return headers.map(row => ({ ...row, items: byPrescription.get(Number(row.id)) || [] }))
  },

  async createPrescription({ prescription_number, patient_name, patient_reference, patient_contact, prescriber_name, prescription_date, notes, items, user_id }) {
    if (!Array.isArray(items) || !items.length) throw new Error('Add at least one prescribed medicine')
    for (const item of items) {
      if (!Number.isInteger(Number(item.product_id)) || !Number.isFinite(Number(item.quantity_prescribed)) || Number(item.quantity_prescribed) <= 0) throw new Error('Each prescription item needs a medicine and positive quantity')
    }
    const rxNumber = String(prescription_number || `RX-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`).trim()
    if (rxNumber.length > 80) throw new Error('Prescription number is too long')
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      const [products] = await conn.execute(`SELECT id FROM products WHERE is_active=1 AND id IN (${items.map(() => '?').join(',')})`, items.map(item => Number(item.product_id)))
      if (new Set(products.map(row => Number(row.id))).size !== new Set(items.map(item => Number(item.product_id))).size) throw new Error('A selected medicine does not exist or is inactive')
      const [result] = await conn.execute(`INSERT INTO pharmacy_prescriptions (prescription_number,patient_name,patient_reference,patient_contact,prescriber_name,prescription_date,notes,created_by)
        VALUES (?,?,?,?,?,?,?,?)`, [rxNumber, patient_name || null, patient_reference || null, patient_contact || null, prescriber_name || null, prescription_date || null, notes || null, user_id])
      for (const item of items) await conn.execute(`INSERT INTO pharmacy_prescription_items
        (prescription_id,product_id,quantity_prescribed,dosage_instructions,frequency,route,duration) VALUES (?,?,?,?,?,?,?)`,
        [result.insertId, Number(item.product_id), Number(item.quantity_prescribed), item.dosage_instructions || null, item.frequency || null, item.route || null, item.duration || null])
      await conn.commit()
      return { id: result.insertId, prescription_number: rxNumber }
    } catch (err) { await conn.rollback(); throw err } finally { conn.release() }
  },

  async listBatches({ search = '', status = 'all', page = 1, limit = 50 } = {}) {
    const pageValue = Number(page), limitValue = Number(limit)
    const p = Number.isFinite(pageValue) ? Math.max(1, Math.floor(pageValue)) : 1
    const n = Number.isFinite(limitValue) ? Math.min(200, Math.max(1, Math.floor(limitValue))) : 50
    const offset = (p - 1) * n
    const where = []
    const params = []
    if (search) { where.push('(p.name LIKE ? OR p.manufacturer LIKE ? OR b.batch_number LIKE ? OR v.name LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) }
    if (status && status !== 'all') {
      if (status === 'expired') where.push('b.expiry_date < CURDATE()')
      else if (status === 'expiring') where.push('b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)')
      else { where.push('b.status = ?'); params.push(status) }
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const [rows] = await db.execute(
      `SELECT b.*, p.name AS product_name, p.dosage, p.manufacturer, p.unit, p.price AS selling_price, p.cost_price,
              v.name AS supplier_name, g.grn_number,
              CASE WHEN b.status IN ('quarantined','recalled') THEN b.status
                   WHEN b.quantity_on_hand <= 0 THEN 'depleted'
                   WHEN b.expiry_date < CURDATE() THEN 'expired'
                   WHEN b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'expiring_soon'
                   WHEN b.quantity_on_hand <= COALESCE(p.low_stock_alert, 0) THEN 'low_stock'
                   ELSE 'active' END AS display_status
       FROM inventory_batches b JOIN products p ON p.id=b.product_id
       LEFT JOIN vendors v ON v.id=b.supplier_id LEFT JOIN goods_received g ON g.id=b.grn_id
       ${clause} ORDER BY b.expiry_date IS NULL, b.expiry_date, b.id
       LIMIT ${n} OFFSET ${offset}`, params)
    const [counts] = await db.execute(`SELECT COUNT(*) AS total FROM inventory_batches b JOIN products p ON p.id=b.product_id LEFT JOIN vendors v ON v.id=b.supplier_id ${clause}`, params)
    return { data: rows, total: Number(counts[0].total), page: p, limit: n }
  },

  async eligibleBatches(product_id) {
    const [rows] = await db.execute(`SELECT id,batch_number,expiry_date,quantity_on_hand FROM inventory_batches
      WHERE product_id=? AND status='active' AND quantity_on_hand>0 AND expiry_date IS NOT NULL AND expiry_date>=CURDATE()
      ORDER BY expiry_date,id`, [product_id])
    return rows
  },

  async addEligibleStock(products) {
    const [rows] = await db.execute(`SELECT product_id,SUM(quantity_on_hand) AS eligible_stock FROM inventory_batches
      WHERE status='active' AND quantity_on_hand>0 AND expiry_date IS NOT NULL AND expiry_date>=CURDATE() GROUP BY product_id`)
    const quantities = new Map(rows.map(row => [Number(row.product_id), Number(row.eligible_stock)]))
    return products.map(product => ({ ...product, eligible_stock: quantities.get(Number(product.id)) || 0 }))
  },

  async getExpirySummary() {
    const [rows] = await db.execute(`SELECT
      SUM(status='active' AND quantity_on_hand>0 AND (expiry_date IS NULL OR expiry_date>=CURDATE())) AS total_batches,
      SUM(expiry_date >= CURDATE() AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND status='active' AND quantity_on_hand>0) AS within_30,
      SUM(expiry_date >= CURDATE() AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 60 DAY) AND status='active' AND quantity_on_hand>0) AS within_60,
      SUM(expiry_date >= CURDATE() AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY) AND status='active' AND quantity_on_hand>0) AS within_90,
      SUM(expiry_date < CURDATE() AND quantity_on_hand>0) AS expired_batches,
      SUM(CASE WHEN expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY) AND status='active' THEN quantity_on_hand * unit_cost ELSE 0 END) AS approaching_value,
      SUM(CASE WHEN expiry_date < CURDATE() THEN quantity_on_hand * unit_cost ELSE 0 END) AS expired_value,
      SUM(CASE WHEN (expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY) OR expiry_date < CURDATE()) AND quantity_on_hand>0 THEN quantity_on_hand ELSE 0 END) AS affected_quantity
      FROM inventory_batches`)
    return rows[0]
  },

  async receiveBatch({ product_id, batch_number, quantity, unit_cost, expiry_date, manufacture_date, received_date, supplier_id, grn_id, user_id }) {
    if (!product_id || !String(batch_number || '').trim() || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) throw new Error('Product, batch number, and a positive quantity are required')
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      const [products] = await conn.execute('SELECT id FROM products WHERE id=? FOR UPDATE', [product_id])
      if (!products.length) throw new Error('Product not found')
      const [old] = await conn.execute('SELECT * FROM inventory_batches WHERE product_id=? AND batch_number=? FOR UPDATE', [product_id, String(batch_number).trim()])
      let batchId, before, after
      if (old.length) {
        const batch = old[0]
        if (String(batch.expiry_date || '').slice(0, 10) !== String(expiry_date || '').slice(0, 10)) throw new Error('Expiry date does not match the existing batch')
        if (['recalled', 'quarantined'].includes(batch.status)) throw new Error('Batch is blocked and cannot receive more sellable stock')
        batchId = batch.id; before = Number(batch.quantity_on_hand); after = before + Number(quantity)
        await conn.execute(`UPDATE inventory_batches SET quantity_received=quantity_received+?,quantity_on_hand=?,status='active',supplier_id=COALESCE(?,supplier_id),grn_id=?,received_date=? WHERE id=?`, [quantity, after, supplier_id || null, grn_id || null, received_date || null, batchId])
      } else {
        before = 0; after = Number(quantity)
        const [result] = await conn.execute(`INSERT INTO inventory_batches
          (product_id,batch_number,supplier_id,grn_id,received_date,manufacture_date,expiry_date,quantity_received,quantity_on_hand,unit_cost,status,created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,'active',?)`, [product_id, String(batch_number).trim(), supplier_id || null, grn_id || null, received_date || null, manufacture_date || null, expiry_date || null, quantity, quantity, unit_cost || 0, user_id || null])
        batchId = result.insertId
      }
      await StockMovement.log({ product_id, movement_type: 'purchase', quantity_change: Number(quantity), reference_type: 'batch_receipt', reference_id: batchId, reason: `Batch ${batch_number}`, performed_by: user_id }, conn)
      await conn.execute(`INSERT INTO batch_stock_movements (batch_id,product_id,movement_type,quantity_change,quantity_before,quantity_after,reference_type,reference_id,reason,performed_by)
        VALUES (?,?,'purchase',?,?,?,'batch_receipt',?,?,?)`, [batchId, product_id, quantity, before, after, grn_id || batchId, `Received batch ${batch_number}`, user_id || null])
      await conn.commit()
      return batchId
    } catch (err) { await conn.rollback(); throw err } finally { conn.release() }
  },

  async setBatchStatus({ batch_id, status, reason, user_id }) {
    if (!['active', 'quarantined', 'recalled'].includes(status)) throw new Error('Invalid batch status')
    if (status !== 'active' && !String(reason || '').trim()) throw new Error('A reason is required to block a batch')
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      const [rows] = await conn.execute('SELECT *, (expiry_date < CURDATE()) AS is_expired FROM inventory_batches WHERE id=? FOR UPDATE', [batch_id])
      const batch = rows[0]
      if (!batch) throw new Error('Batch not found')
      if (status === 'active' && batch.is_expired) throw new Error('Expired stock cannot be reactivated')
      await conn.execute('UPDATE inventory_batches SET status=?,status_reason=? WHERE id=?', [status, reason || null, batch_id])
      await conn.execute(`INSERT INTO batch_stock_movements (batch_id,product_id,movement_type,quantity_change,quantity_before,quantity_after,reference_type,reason,performed_by)
        VALUES (?,?,?,0,?,?, 'batch_status',?,?)`, [batch_id, batch.product_id, status === 'recalled' ? 'recall' : status === 'quarantined' ? 'quarantine' : 'status_change', batch.quantity_on_hand, batch.quantity_on_hand, reason || status, user_id])
      await conn.commit()
    } catch (err) { await conn.rollback(); throw err } finally { conn.release() }
  },

  async updateBatchInfo({ batch_id, batch_number, expiry_date, manufacture_date, supplier_id, reason, user_id }) {
    const lot = String(batch_number || '').trim()
    if (!lot || lot.length > 80 || !/^\d{4}-\d{2}-\d{2}$/.test(String(expiry_date || '')) || !String(reason || '').trim()) {
      throw new Error('Batch number, valid expiry date, and reason are required')
    }
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      const [rows] = await conn.execute('SELECT * FROM inventory_batches WHERE id=? FOR UPDATE', [batch_id])
      const batch = rows[0]
      if (!batch) throw new Error('Batch not found')
      const [expiredRows] = await conn.execute('SELECT ? < CURDATE() AS expired', [expiry_date])
      if (expiredRows[0].expired && Number(batch.quantity_on_hand) > 0 && batch.status === 'active') {
        throw new Error('A batch with remaining stock cannot be marked as active with a past expiry date')
      }
      await conn.execute(`UPDATE inventory_batches SET batch_number=?,expiry_date=?,manufacture_date=?,supplier_id=COALESCE(?,supplier_id) WHERE id=?`,
        [lot, expiry_date, manufacture_date || null, supplier_id || null, batch_id])
      await conn.execute(`INSERT INTO batch_stock_movements (batch_id,product_id,movement_type,quantity_change,quantity_before,quantity_after,reference_type,reason,performed_by)
        VALUES (?,?, 'status_change',0,?,?, 'batch_metadata',?,?)`, [batch_id, batch.product_id, batch.quantity_on_hand, batch.quantity_on_hand,
        `${reason.trim()} (batch ${batch.batch_number} → ${lot}; expiry ${String(batch.expiry_date || 'unknown').slice(0, 10)} → ${expiry_date})`, user_id])
      await conn.commit()
    } catch (err) { await conn.rollback(); throw err } finally { conn.release() }
  },

  async adjustBatch({ batch_id, quantity_change, reason, user_id, movement_type = 'adjustment' }) {
    const delta = Number(quantity_change)
    if (!Number.isFinite(delta) || delta === 0 || !String(reason || '').trim()) throw new Error('Enter a non-zero quantity change and a reason')
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      const [ownerRows] = await conn.execute('SELECT product_id FROM inventory_batches WHERE id=?', [batch_id])
      if (!ownerRows.length) throw new Error('Batch not found')
      await conn.execute('SELECT id FROM products WHERE id=? FOR UPDATE', [ownerRows[0].product_id])
      const [rows] = await conn.execute('SELECT * FROM inventory_batches WHERE id=? FOR UPDATE', [batch_id])
      const batch = rows[0]
      if (!batch) throw new Error('Batch not found')
      if (batch.status !== 'active') throw new Error('Only active batches can be adjusted')
      const after = Number(batch.quantity_on_hand) + delta
      if (after < 0) throw new Error('Adjustment exceeds batch quantity on hand')
      await conn.execute('UPDATE inventory_batches SET quantity_on_hand=? WHERE id=?', [after, batch_id])
      const batchMovementType = movement_type === 'damage' ? 'damage' : 'adjustment'
      await conn.execute(`INSERT INTO batch_stock_movements (batch_id,product_id,movement_type,quantity_change,quantity_before,quantity_after,reference_type,reason,performed_by)
        VALUES (?,?, ?,?,?,?,'manual_adjustment',?,?)`, [batch_id, batch.product_id, batchMovementType, delta, batch.quantity_on_hand, after, reason, user_id])
      await StockMovement.log({ product_id: batch.product_id, movement_type: movement_type === 'damage' ? 'damage' : 'adjustment', quantity_change: delta, reference_type: 'batch_adjustment', reference_id: batch_id, reason, performed_by: user_id }, conn)
      await conn.commit()
    } catch (err) { await conn.rollback(); throw err } finally { conn.release() }
  },

  async movements(batch_id) {
    const [rows] = await db.execute(`SELECT m.*,u.name AS performed_by_name FROM batch_stock_movements m LEFT JOIN users u ON u.id=m.performed_by WHERE m.batch_id=? ORDER BY m.created_at DESC LIMIT 200`, [batch_id])
    return rows
  }
}

module.exports = Pharmacy
