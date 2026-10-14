const db = require('../config/database')
const StockMovement = require('./stockMovement')

const DispensingLog = {
  // Inarekodi dispensing NA kupunguza stock kwa pamoja (atomic transaction),
  // ikitumia StockMovement.log() (movement_type='dispensing') sawa na
  // pattern ya sale/GRN/void/conversion.
  async create({ product_id, batch_number, quantity_dispensed, patient_name, prescriber_name, dosage_instructions, dispensed_by }) {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      const [result] = await conn.execute(
        `INSERT INTO dispensing_log
          (product_id, batch_number, quantity_dispensed, patient_name, prescriber_name, dosage_instructions, dispensed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [product_id, batch_number || null, quantity_dispensed, patient_name || null, prescriber_name || null, dosage_instructions || null, dispensed_by]
      )
      const logId = result.insertId

      await StockMovement.log({
        product_id,
        movement_type: 'dispensing',
        quantity_change: -Math.abs(quantity_dispensed),
        reference_type: 'dispensing',
        reference_id: logId,
        reason: null,
        performed_by: dispensed_by
      }, conn)

      await conn.commit()
      return logId
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async findAll({ limit = 100 } = {}) {
    const safeLimit = Number(limit) || 100
    const [rows] = await db.execute(
      `SELECT dl.*, p.name AS product_name, p.unit, u.name AS dispensed_by_name
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
