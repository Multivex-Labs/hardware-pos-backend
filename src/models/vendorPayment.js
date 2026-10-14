const db = require('../config/database')

const VendorPayment = {
  async create({ vendor_id, amount, payment_method, notes, recorded_by }) {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      const [rows] = await conn.execute('SELECT id, balance FROM vendors WHERE id = ? FOR UPDATE', [vendor_id])
      if (rows.length === 0) {
        throw new Error('Vendor haikupatikana')
      }

      const [result] = await conn.execute(
        'INSERT INTO vendor_payments (vendor_id, amount, payment_method, notes, recorded_by) VALUES (?, ?, ?, ?, ?)',
        [vendor_id, amount, payment_method || 'cash', notes || null, recorded_by]
      )

      await conn.execute('UPDATE vendors SET balance = balance - ? WHERE id = ?', [amount, vendor_id])

      await conn.commit()
      return { id: result.insertId, new_balance: Number(rows[0].balance) - Number(amount) }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async findByVendor(vendor_id) {
    const [rows] = await db.execute(
      'SELECT * FROM vendor_payments WHERE vendor_id = ? ORDER BY created_at DESC', [vendor_id]
    )
    return rows
  }
}

module.exports = VendorPayment
