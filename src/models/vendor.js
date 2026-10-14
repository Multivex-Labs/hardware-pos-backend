const db = require('../config/database')

const Vendor = {
  async findAll() {
    const [rows] = await db.execute('SELECT * FROM vendors ORDER BY name ASC')
    return rows
  },
  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM vendors WHERE id = ?', [id])
    return rows[0]
  },
  async create(name, contact_person, phone, email, address, notes) {
    const [result] = await db.execute(
      'INSERT INTO vendors (name, contact_person, phone, email, address, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [name, contact_person || null, phone || null, email || null, address || null, notes || null]
    )
    return result.insertId
  },
  async update(id, name, contact_person, phone, email, address, notes) {
    const [result] = await db.execute(
      'UPDATE vendors SET name=?, contact_person=?, phone=?, email=?, address=?, notes=? WHERE id=?',
      [name, contact_person || null, phone || null, email || null, address || null, notes || null, id]
    )
    return result.affectedRows
  },
  async delete(id) {
    const [result] = await db.execute('DELETE FROM vendors WHERE id = ?', [id])
    return result.affectedRows
  }
}

module.exports = Vendor
