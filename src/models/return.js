const db = require('../config/database')

const Return = {
  // Pata ni kiasi gani tayari kimeshirikishwa kurudi kwa kila sale_item (kuzuia double-return)
  async getReturnedQtyMap(saleId) {
    const [rows] = await db.execute(
      `SELECT ri.sale_item_id, SUM(ri.quantity_returned) as returned_qty
       FROM return_items ri
       JOIN returns r ON ri.return_id = r.id
       WHERE r.sale_id = ?
       GROUP BY ri.sale_item_id`,
      [saleId]
    )
    const map = {}
    rows.forEach(r => { map[r.sale_item_id] = Number(r.returned_qty) })
    return map
  },

  // Fanya return kamili: hifadhi return + items, rudisha stock, na kama ni store_credit ongeza amana ya client
  // Transaction moja - ikiharibika chochote, yote yanarudi nyuma (rollback)
  async processReturn({ sale_id, client_id, processed_by, refund_method, reason, notes, items }) {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      const total_refund = items.reduce((sum, i) => sum + (i.price * i.quantity_returned), 0)

      const [result] = await conn.execute(
        'INSERT INTO returns (sale_id, client_id, processed_by, total_refund, refund_method, reason, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sale_id, client_id || null, processed_by, total_refund, refund_method, reason || null, notes || null]
      )
      const returnId = result.insertId

      for (const item of items) {
        await conn.execute(
          'INSERT INTO return_items (return_id, sale_item_id, product_id, quantity_returned, price, subtotal, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [returnId, item.sale_item_id, item.product_id, item.quantity_returned, item.price, item.price * item.quantity_returned, item.reason || null]
        )
        // Rudisha stock ghalani
        await conn.execute('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity_returned, item.product_id])
      }

      // Store credit → ongeza kwenye amana ya client (deposit) badala ya kutoa cash
      if (refund_method === 'store_credit' && client_id) {
        await conn.execute('UPDATE clients SET deposit = deposit + ? WHERE id = ?', [total_refund, client_id])
      }

      await conn.commit()
      return { returnId, total_refund }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async findAll() {
    const [rows] = await db.execute(
      `SELECT r.id, r.sale_id, r.total_refund, r.refund_method, r.reason, r.created_at,
       c.name as client_name, u.name as processed_by_name
       FROM returns r
       LEFT JOIN clients c ON r.client_id = c.id
       LEFT JOIN users u ON r.processed_by = u.id
       ORDER BY r.created_at DESC`
    )
    return rows
  },

  async findById(id) {
    const [ret] = await db.execute(
      `SELECT r.*, c.name as client_name, u.name as processed_by_name
       FROM returns r
       LEFT JOIN clients c ON r.client_id = c.id
       LEFT JOIN users u ON r.processed_by = u.id
       WHERE r.id = ?`,
      [id]
    )
    const [items] = await db.execute(
      `SELECT ri.*, p.name as product_name
       FROM return_items ri
       JOIN products p ON ri.product_id = p.id
       WHERE ri.return_id = ?`,
      [id]
    )
    return { return: ret[0], items }
  },

  async findBySale(saleId) {
    const [rows] = await db.execute('SELECT * FROM returns WHERE sale_id = ? ORDER BY created_at DESC', [saleId])
    return rows
  }
}

module.exports = Return
