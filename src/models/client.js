const db = require('../config/database')

const Client = {
  // Pata clients zote
  async findAll() {
    const [rows] = await db.execute(
      'SELECT * FROM clients ORDER BY name ASC'
    )
    return rows
  },

  // Pata client moja kwa id
  async findById(id) {
    const [rows] = await db.execute(
      'SELECT * FROM clients WHERE id = ?',
      [id]
    )
    return rows[0]
  },

  // Tafuta client kwa jina au simu
  async search(query) {
    const [rows] = await db.execute(
      'SELECT * FROM clients WHERE name LIKE ? OR phone LIKE ?',
      [`%${query}%`, `%${query}%`]
    )
    return rows
  },

  // Unda client mpya
  async create(name, phone, email, address) {
    const [result] = await db.execute(
      'INSERT INTO clients (name, phone, email, address) VALUES (?, ?, ?, ?)',
      [name, phone, email, address]
    )
    return result.insertId
  },

  // Edit client
  async update(id, name, phone, email, address) {
    const [result] = await db.execute(
      'UPDATE clients SET name=?, phone=?, email=?, address=? WHERE id=?',
      [name, phone, email, address, id]
    )
    return result.affectedRows
  },

  // Futa client
  async delete(id) {
    const [result] = await db.execute(
      'DELETE FROM clients WHERE id = ?',
      [id]
    )
    return result.affectedRows
  },

  // Pata history ya manunuzi ya client
  async getPurchaseHistory(id) {
    const [rows] = await db.execute(
      `SELECT s.id, s.total, s.discount, s.payment_method, s.created_at,
       COUNT(si.id) as items_count
       FROM sales s
       LEFT JOIN sale_items si ON s.id = si.sale_id
       WHERE s.client_id = ?
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [id]
    )
    return rows
  }
}

module.exports = Client