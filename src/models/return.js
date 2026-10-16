const db = require('../config/database')
const StockMovement = require('./stockMovement')

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

      const [businessRows] = await conn.execute('SELECT business_type FROM business_settings WHERE id=1')
      const isPharmacy = businessRows[0]?.business_type === 'pharmacy'

      const total_refund = items.reduce((sum, i) => sum + (i.price * i.quantity_returned), 0)

      const [result] = await conn.execute(
        'INSERT INTO returns (sale_id, client_id, processed_by, total_refund, refund_method, reason, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sale_id, client_id || null, processed_by, total_refund, refund_method, reason || null, notes || null]
      )
      const returnId = result.insertId

      for (const item of items) {
        const [returnItemResult] = await conn.execute(
          'INSERT INTO return_items (return_id, sale_item_id, product_id, quantity_returned, price, subtotal, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [returnId, item.sale_item_id, item.product_id, item.quantity_returned, item.price, item.price * item.quantity_returned, item.reason || null]
        )
        if (isPharmacy) {
          const [saleItemRows] = await conn.execute('SELECT conversion_factor,cost_price FROM sale_items WHERE id=? FOR UPDATE', [item.sale_item_id])
          const baseQuantity = Number(item.quantity_returned) * Number(saleItemRows[0]?.conversion_factor || 1)
          await conn.execute('SELECT id FROM products WHERE id=? FOR UPDATE', [item.product_id])
          const [batchResult] = await conn.execute(`INSERT INTO inventory_batches
            (product_id,batch_number,received_date,quantity_received,quantity_on_hand,unit_cost,status,status_reason)
            VALUES (?,?,CURDATE(),?,?,?,'quarantined','Customer return; inspect before releasing for sale or dispensing')`,
            [item.product_id, `RETURN-${returnId}-${returnItemResult.insertId}`, baseQuantity, baseQuantity, saleItemRows[0]?.cost_price || 0])
          await conn.execute(`INSERT INTO batch_stock_movements
            (batch_id,product_id,movement_type,quantity_change,quantity_before,quantity_after,reference_type,reference_id,reason,performed_by)
            VALUES (?,?,'return',?,0,?,'return',?,?,?)`, [batchResult.insertId, item.product_id, baseQuantity, baseQuantity, returnId, 'Customer return quarantined for inspection', processed_by])
          await StockMovement.log({ product_id: item.product_id, movement_type: 'return', quantity_change: baseQuantity, reference_type: 'return', reference_id: returnId, reason: 'Customer return placed in quarantined batch', performed_by: processed_by }, conn)
        } else {
          // Rudisha stock ghalani kwa biashara zisizo pharmacy
          await conn.execute('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity_returned, item.product_id])
        }
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
