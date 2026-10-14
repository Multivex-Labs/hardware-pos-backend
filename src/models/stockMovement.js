const db = require('../config/database')

const StockMovement = {
  /**
   * log() — kazi kuu. Inafanya VITU VIWILI pamoja, ATOMIC (transaction moja):
   *   1. Inasasisha products.stock (increment au decrement)
   *   2. Inarekodi movement kwenye stock_movements na stock_before/stock_after
   *
   * MUHIMU: Ukiita hii kutoka ndani ya operation nyingine ambayo TAYARI iko
   * kwenye transaction yake (voidSale, GRN.receive), PITISHA `connection`
   * yao kama parameter ya pili — kama operation kuu itafeli na kufanya
   * rollback, movement log pia ita-rollback pamoja nayo.
   *
   * quantity_change: NEGATIVE = stock inapungua (sale, damage)
   *                  POSITIVE = stock inaongezeka (purchase/GRN, return, void_reversal)
   */
  async log(
    { product_id, movement_type, quantity_change, reference_type = null, reference_id = null, reason = null, performed_by },
    connection = null
  ) {
    const conn = connection || (await db.getConnection())
    const isOwnTransaction = !connection

    try {
      if (isOwnTransaction) await conn.beginTransaction()

      // FOR UPDATE = lock ya row hii, kuzuia race condition (mfano cashier
      // wawili wakiuza bidhaa ile ile kwa wakati mmoja)
      const [rows] = await conn.execute('SELECT stock FROM products WHERE id = ? FOR UPDATE', [product_id])
      if (rows.length === 0) {
        throw new Error(`Product ID ${product_id} haipo kwenye database`)
      }

      const stockBefore = rows[0].stock
      const stockAfter = stockBefore + quantity_change

      if (stockAfter < 0) {
        throw new Error(
          `Stock haiwezi kuwa negative. Product ID ${product_id}: stock ya sasa ni ${stockBefore}, ` +
          `operation hii inajaribu kubadilisha kwa ${quantity_change}`
        )
      }

      await conn.execute('UPDATE products SET stock = ? WHERE id = ?', [stockAfter, product_id])

      const [result] = await conn.execute(
        `INSERT INTO stock_movements
          (product_id, movement_type, quantity_change, stock_before, stock_after,
           reference_type, reference_id, reason, performed_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [product_id, movement_type, quantity_change, stockBefore, stockAfter, reference_type, reference_id, reason, performed_by]
      )

      if (isOwnTransaction) await conn.commit()

      return {
        id: result.insertId,
        product_id,
        movement_type,
        quantity_change,
        stock_before: stockBefore,
        stock_after: stockAfter
      }
    } catch (err) {
      if (isOwnTransaction) await conn.rollback()
      throw err
    } finally {
      if (isOwnTransaction) conn.release()
    }
  },

  // Orodha ya movements na filters za hiari - kwa "Historia ya Stock" tab
  async findAll({ product_id, movement_type, date_from, date_to, page = 1, limit = 50 } = {}) {
    const conditions = []
    const params = []

    if (product_id) { conditions.push('sm.product_id = ?'); params.push(product_id) }
    if (movement_type) { conditions.push('sm.movement_type = ?'); params.push(movement_type) }
    if (date_from) { conditions.push('sm.created_at >= ?'); params.push(date_from) }
    if (date_to) { conditions.push('sm.created_at <= ?'); params.push(date_to) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const safeLimit = Number(limit) || 50
    const safePage = Number(page) || 1
    const offset = (safePage - 1) * safeLimit

    // NB: LIMIT/OFFSET zimewekwa moja kwa moja kwenye query string (sio
    // placeholders ?) kwa sababu baadhi ya mysql2 versions zina ubug na
    // prepared statements kwenye LIMIT/OFFSET. Ni salama hapa kwa sababu
    // tumeshazi-force ku-Number() hapo juu (hazitoki moja kwa moja kwa user).
    const [rows] = await db.execute(
      `SELECT sm.*, p.name AS product_name, u.name AS performed_by_name
       FROM stock_movements sm
       LEFT JOIN products p ON p.id = sm.product_id
       LEFT JOIN users u ON u.id = sm.performed_by
       ${where}
       ORDER BY sm.created_at DESC
       LIMIT ${safeLimit} OFFSET ${offset}`,
      params
    )

    const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM stock_movements sm ${where}`, params)

    return { data: rows, total: countRows[0].total, page: safePage, limit: safeLimit }
  },

  async findByProduct(product_id, opts = {}) {
    return this.findAll({ ...opts, product_id })
  }
}

module.exports = StockMovement
