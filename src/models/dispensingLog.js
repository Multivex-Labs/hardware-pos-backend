const db = require('../config/database')
const StockMovement = require('./stockMovement')

const DispensingLog = {
  // Inarekodi dispensing NA kupunguza stock kwa pamoja (atomic transaction),
  // ikitumia StockMovement.log() (movement_type='dispensing') sawa na
  // pattern ya sale/GRN/void/conversion.
  async create({ product_id, batch_number, quantity_dispensed, patient_name, prescriber_name, dosage_instructions, dispensed_by, request_key, prescription_item_id }) {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      if (request_key) {
        const [existing] = await conn.execute('SELECT result_id FROM pharmacy_idempotency_keys WHERE operation=? AND request_key=? FOR UPDATE', ['dispensing', request_key])
        if (existing.length && existing[0].result_id) {
          await conn.commit()
          return { id: Number(existing[0].result_id), duplicate: true }
        }
        await conn.execute('INSERT INTO pharmacy_idempotency_keys (operation,request_key) VALUES (?,?)', ['dispensing', request_key])
      }

      const [settingsRows] = await conn.execute('SELECT business_type FROM business_settings WHERE id=1')
      if (settingsRows[0]?.business_type !== 'pharmacy') throw new Error('Dispensing is available only for pharmacy businesses')
      const [productRows] = await conn.execute('SELECT id,stock,unit,name,requires_prescription,drug_category FROM products WHERE id=? AND is_active=1 FOR UPDATE', [product_id])
      if (!productRows.length) throw new Error('Medicine not found or inactive')
      const medicine = productRows[0]
      if ((medicine.requires_prescription || ['prescription', 'controlled'].includes(medicine.drug_category)) && !prescription_item_id) throw new Error('This medicine requires a registered prescription before dispensing')
      const quantity = Number(quantity_dispensed)
      let prescriptionItem = null
      if (prescription_item_id) {
        const [prescriptionRows] = await conn.execute(`SELECT i.*,r.id AS prescription_id,r.prescription_number,r.status AS prescription_status,r.patient_name AS rx_patient,r.prescriber_name AS rx_prescriber
          FROM pharmacy_prescription_items i JOIN pharmacy_prescriptions r ON r.id=i.prescription_id WHERE i.id=? FOR UPDATE`, [prescription_item_id])
        prescriptionItem = prescriptionRows[0]
        if (!prescriptionItem || Number(prescriptionItem.product_id) !== Number(product_id)) throw new Error('Prescription item does not match selected medicine')
        if (['cancelled','dispensed'].includes(prescriptionItem.prescription_status)) throw new Error('Prescription is cancelled or already fully dispensed')
        const remainingRx = Number(prescriptionItem.quantity_prescribed) - Number(prescriptionItem.quantity_dispensed)
        if (quantity > remainingRx) throw new Error(`Cannot dispense more than the remaining prescribed quantity (${remainingRx})`)
        patient_name = prescriptionItem.rx_patient
        prescriber_name = prescriptionItem.rx_prescriber
        dosage_instructions = prescriptionItem.dosage_instructions
      }
      const [batches] = await conn.execute(`SELECT id,batch_number,quantity_on_hand FROM inventory_batches
        WHERE product_id=? AND status='active' AND quantity_on_hand>0 AND expiry_date IS NOT NULL AND expiry_date>=CURDATE()
        ORDER BY expiry_date ASC,id ASC FOR UPDATE`, [product_id])
      const eligibleQty = batches.reduce((sum, row) => sum + Number(row.quantity_on_hand), 0)
      if (eligibleQty < quantity) throw new Error(`Eligible non-expired batch stock is insufficient. Available: ${eligibleQty} ${productRows[0].unit || ''}`)
      if (Number(productRows[0].stock) < quantity) throw new Error('Product stock is insufficient')

      const [result] = await conn.execute(
        `INSERT INTO dispensing_log
          (product_id, batch_number, quantity_dispensed, patient_name, prescriber_name, dosage_instructions, dispensed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [product_id, batches.length === 1 && Number(batches[0].quantity_on_hand) >= quantity ? batches[0].batch_number : 'FEFO', quantity_dispensed, patient_name || null, prescriber_name || null, dosage_instructions || null, dispensed_by]
      )
      const logId = result.insertId

      if (prescriptionItem) {
        await conn.execute('INSERT INTO dispensing_prescription_links (dispensing_log_id,prescription_item_id,quantity) VALUES (?,?,?)', [logId, prescriptionItem.id, quantity])
        await conn.execute('UPDATE pharmacy_prescription_items SET quantity_dispensed=quantity_dispensed+? WHERE id=?', [quantity, prescriptionItem.id])
        await conn.execute(`UPDATE pharmacy_prescriptions r SET status=CASE
          WHEN NOT EXISTS (SELECT 1 FROM pharmacy_prescription_items i WHERE i.prescription_id=r.id AND i.quantity_dispensed<i.quantity_prescribed) THEN 'dispensed'
          WHEN EXISTS (SELECT 1 FROM pharmacy_prescription_items i WHERE i.prescription_id=r.id AND i.quantity_dispensed>0) THEN 'partially_dispensed'
          ELSE 'pending' END WHERE r.id=?`, [prescriptionItem.prescription_id])
      }

      let remaining = quantity
      for (const batch of batches) {
        if (remaining <= 0) break
        const take = Math.min(remaining, Number(batch.quantity_on_hand))
        const after = Number(batch.quantity_on_hand) - take
        await conn.execute('UPDATE inventory_batches SET quantity_on_hand=?,status=? WHERE id=?', [after, after <= 0 ? 'depleted' : 'active', batch.id])
        await conn.execute(`INSERT INTO dispensing_batch_allocations (dispensing_log_id,batch_id,quantity) VALUES (?,?,?)`, [logId, batch.id, take])
        await conn.execute(`INSERT INTO batch_stock_movements (batch_id,product_id,movement_type,quantity_change,quantity_before,quantity_after,reference_type,reference_id,reason,performed_by)
          VALUES (?,?,'dispensing',?,?,?,'dispensing',?,NULL,?)`, [batch.id, product_id, -take, batch.quantity_on_hand, after, logId, dispensed_by])
        remaining -= take
      }

      await StockMovement.log({
        product_id,
        movement_type: 'dispensing',
        quantity_change: -quantity,
        reference_type: 'dispensing',
        reference_id: logId,
        reason: null,
        performed_by: dispensed_by
      }, conn)

      if (request_key) await conn.execute('UPDATE pharmacy_idempotency_keys SET result_id=? WHERE operation=? AND request_key=?', [logId, 'dispensing', request_key])

      await conn.commit()
      return { id: logId, duplicate: false }
    } catch (err) {
      await conn.rollback()
      if (err.code === 'ER_DUP_ENTRY' && request_key) {
        const [rows] = await db.execute('SELECT result_id FROM pharmacy_idempotency_keys WHERE operation=? AND request_key=?', ['dispensing', request_key])
        if (rows[0]?.result_id) return { id: Number(rows[0].result_id), duplicate: true }
      }
      throw err
    } finally {
      conn.release()
    }
  },

  async findAll({ limit = 100 } = {}) {
    const safeLimit = Number(limit) || 100
    const [rows] = await db.execute(
      `SELECT dl.*, p.name AS product_name, p.unit, u.name AS dispensed_by_name,
              (SELECT GROUP_CONCAT(DISTINCT b.batch_number ORDER BY b.expiry_date SEPARATOR ', ')
               FROM dispensing_batch_allocations a JOIN inventory_batches b ON b.id=a.batch_id
               WHERE a.dispensing_log_id=dl.id) AS batch_numbers,
              (SELECT GROUP_CONCAT(DISTINCT r.prescription_number SEPARATOR ', ')
               FROM dispensing_prescription_links l JOIN pharmacy_prescription_items i ON i.id=l.prescription_item_id
               JOIN pharmacy_prescriptions r ON r.id=i.prescription_id WHERE l.dispensing_log_id=dl.id) AS prescription_number
       FROM dispensing_log dl
       JOIN products p ON dl.product_id = p.id
       LEFT JOIN users u ON dl.dispensed_by = u.id
       ORDER BY dl.created_at DESC
       LIMIT ${safeLimit}`
    )
    return rows
  }
}

module.exports = DispensingLog
