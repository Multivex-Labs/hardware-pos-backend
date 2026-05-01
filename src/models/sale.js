const db = require('../config/database')

const Sale = {
  // Unda sale mpya
  async create(client_id, user_id, total, discount, payment_method) {
    const [result] = await db.execute(
      'INSERT INTO sales (client_id, user_id, total, discount, payment_method) VALUES (?, ?, ?, ?, ?)',
      [client_id, user_id, total, discount, payment_method]
    )
    return result.insertId
  },

  // Ongeza items kwenye sale
  async addItems(sale_id, items) {
    for (const item of items) {
      await db.execute(
        'INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [sale_id, item.product_id, item.quantity, item.price]
      )
    }
  },

  // Pata sales zote
  async findAll() {
    const [rows] = await db.execute(
      `SELECT s.id, s.total, s.discount, s.payment_method, s.created_at,
       c.name as client_name, u.name as cashier_name
       FROM sales s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       ORDER BY s.created_at DESC`
    )
    return rows
  },

  // Pata sale moja na items zake
  async findById(id) {
    const [sale] = await db.execute(
      `SELECT s.id, s.total, s.discount, s.payment_method, s.created_at,
       c.name as client_name, u.name as cashier_name
       FROM sales s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = ?`,
      [id]
    )

    const [items] = await db.execute(
      `SELECT si.quantity, si.price, p.name as product_name
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = ?`,
      [id]
    )

    return { sale: sale[0], items }
  },

  // Pata sales za leo
  async findToday() {
    const [rows] = await db.execute(
      `SELECT s.id, s.total, s.discount, s.payment_method, s.created_at,
       c.name as client_name, u.name as cashier_name
       FROM sales s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE DATE(s.created_at) = CURDATE()
       ORDER BY s.created_at DESC`
    )
    return rows
  },

  // Pata report ya mwezi
  async findByMonth(year, month) {
    const [rows] = await db.execute(
      `SELECT s.id, s.total, s.discount, s.payment_method, s.created_at,
       c.name as client_name, u.name as cashier_name
       FROM sales s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE YEAR(s.created_at) = ? AND MONTH(s.created_at) = ?
       ORDER BY s.created_at DESC`,
      [year, month]
    )
    return rows
  }
}

module.exports = Sale