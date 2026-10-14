const db = require('../config/database')
const StockMovement = require('./stockMovement')

const StockConversion = {
  // Inafanya VITU VITATU kwa pamoja, ATOMIC (transaction moja):
  //  1. Inarekodi conversion record (kwa historia/audit)
  //  2. Inapunguza stock ya "from" product (movement_type='transfer_out')
  //  3. Inaongeza stock ya "to" product (movement_type='transfer_in')
  //
  // Zote mbili (2) na (3) zina reference_type='conversion' + reference_id
  // ya conversion hii - kwa hiyo Stock History inaweza kuonyesha zote mbili
  // zikiwa zimeunganishwa kwenye operesheni moja.
  async create({ from_product_id, from_quantity, to_product_id, to_quantity, reason, performed_by }) {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      const [result] = await conn.execute(
        'INSERT INTO stock_conversions (from_product_id, from_quantity, to_product_id, to_quantity, reason, performed_by) VALUES (?, ?, ?, ?, ?, ?)',
        [from_product_id, from_quantity, to_product_id, to_quantity, reason || null, performed_by]
      )
      const conversionId = result.insertId

      // Punguza stock ya bidhaa ya chanzo (mfano Cement - Bag: -1)
      await StockMovement.log({
        product_id: from_product_id,
        movement_type: 'transfer_out',
        quantity_change: -Math.abs(from_quantity),
        reference_type: 'conversion',
        reference_id: conversionId,
        reason: reason || null,
        performed_by
      }, conn)

      // Ongeza stock ya bidhaa lengwa (mfano Cement - KG: +50)
      await StockMovement.log({
        product_id: to_product_id,
        movement_type: 'transfer_in',
        quantity_change: Math.abs(to_quantity),
        reference_type: 'conversion',
        reference_id: conversionId,
        reason: reason || null,
        performed_by
      }, conn)

      await conn.commit()
      return conversionId
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async findAll() {
    const [rows] = await db.execute(
      `SELECT sc.*,
       pf.name as from_product_name, pf.unit as from_unit,
       pt.name as to_product_name, pt.unit as to_unit,
       u.name as performed_by_name
       FROM stock_conversions sc
       JOIN products pf ON sc.from_product_id = pf.id
       JOIN products pt ON sc.to_product_id = pt.id
       LEFT JOIN users u ON sc.performed_by = u.id
       ORDER BY sc.created_at DESC
       LIMIT 100`
    )
    return rows
  }
}

module.exports = StockConversion
