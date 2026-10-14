const db = require('../config/database')

const ProductUnit = {
  async findByProduct(product_id) {
    const [rows] = await db.execute(
      'SELECT * FROM product_units WHERE product_id = ? ORDER BY conversion_factor ASC',
      [product_id]
    )
    return rows
  },

  // Zote kwa mara moja (zote products) - inatumika na Sales page ili isifanye
  // request tofauti kwa kila product kwenye grid
  async findAll() {
    const [rows] = await db.execute('SELECT * FROM product_units ORDER BY product_id, conversion_factor ASC')
    return rows
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM product_units WHERE id = ?', [id])
    return rows[0]
  },

  async create(product_id, unit_name, conversion_factor, selling_price, wholesale_price) {
    const [result] = await db.execute(
      'INSERT INTO product_units (product_id, unit_name, conversion_factor, selling_price, wholesale_price) VALUES (?, ?, ?, ?, ?)',
      [product_id, unit_name, conversion_factor, selling_price, wholesale_price || null]
    )
    return result.insertId
  },

  async update(id, unit_name, conversion_factor, selling_price, wholesale_price) {
    const [result] = await db.execute(
      'UPDATE product_units SET unit_name=?, conversion_factor=?, selling_price=?, wholesale_price=? WHERE id=?',
      [unit_name, conversion_factor, selling_price, wholesale_price || null, id]
    )
    return result.affectedRows
  },

  async delete(id) {
    const [result] = await db.execute('DELETE FROM product_units WHERE id = ?', [id])
    return result.affectedRows
  }
}

module.exports = ProductUnit
