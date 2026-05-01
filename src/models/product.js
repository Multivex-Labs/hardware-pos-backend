const db = require('../config/database')

const Product = {
  async findAll() {
    const [rows] = await db.execute(
      'SELECT * FROM products ORDER BY name ASC'
    )
    return rows
  },

  async findById(id) {
    const [rows] = await db.execute(
      'SELECT * FROM products WHERE id = ?',
      [id]
    )
    return rows[0]
  },

  async create(name, description, price, stock, unit, low_stock_alert, category) {
    const [result] = await db.execute(
      'INSERT INTO products (name, description, price, stock, unit, low_stock_alert, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, description, price, stock, unit || 'PC', low_stock_alert, category]
    )
    return result.insertId
  },

  async update(id, name, description, price, stock, unit, low_stock_alert, category) {
    const [result] = await db.execute(
      'UPDATE products SET name=?, description=?, price=?, stock=?, unit=?, low_stock_alert=?, category=? WHERE id=?',
      [name, description, price, stock, unit, low_stock_alert, category, id]
    )
    return result.affectedRows
  },

  async delete(id) {
    const [result] = await db.execute(
      'DELETE FROM products WHERE id = ?',
      [id]
    )
    return result.affectedRows
  },

  async findLowStock() {
    const [rows] = await db.execute(
      'SELECT * FROM products WHERE stock <= low_stock_alert ORDER BY stock ASC'
    )
    return rows
  },

  async decreaseStock(id, quantity) {
    const [result] = await db.execute(
      'UPDATE products SET stock = stock - ? WHERE id = ?',
      [quantity, id]
    )
    return result.affectedRows
  }
}

module.exports = Product