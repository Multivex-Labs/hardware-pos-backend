const db = require('../config/database')

const Purchase = {
  async create(product_id, quantity, cost_per_unit, total_cost, supplier, notes, user_id) {
    const [result] = await db.execute(
      'INSERT INTO purchases (product_id, quantity, cost_per_unit, total_cost, supplier, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [product_id, quantity, cost_per_unit, total_cost, supplier, notes, user_id]
    )
    return result.insertId
  },

  async findAll() {
    const [rows] = await db.execute(
      `SELECT p.*, pr.name as product_name, pr.unit, u.name as recorded_by
       FROM purchases p
       JOIN products pr ON p.product_id = pr.id
       LEFT JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC`
    )
    return rows
  },

  async findByProduct(product_id) {
    const [rows] = await db.execute(
      `SELECT p.*, u.name as recorded_by
       FROM purchases p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.product_id = ?
       ORDER BY p.created_at DESC`,
      [product_id]
    )
    return rows
  }
}

module.exports = Purchase