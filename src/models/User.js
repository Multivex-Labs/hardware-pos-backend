const db = require('../config/database')
const bcrypt = require('bcryptjs')

const User = {
  // Pata user kwa email
  async findByEmail(email) {
    const [rows] = await db.execute(
      'SELECT * FROM users WHERE email = ?', 
      [email]
    )
    return rows[0]
  },

  // Unda user mpya
  async create(name, email, password, role = 'cashier') {
    const hashedPassword = await bcrypt.hash(password, 10)
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role]
    )
    return result.insertId
  },

  // Pata user kwa id
  async findById(id) {
    const [rows] = await db.execute(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [id]
    )
    return rows[0]
  },

  // Pata users wote (bila password)
  async findAll() {
    const [rows] = await db.execute(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    )
    return rows
  },

  // Futa user
  async delete(id) {
    const [result] = await db.execute(
      'DELETE FROM users WHERE id = ?',
      [id]
    )
    return result.affectedRows > 0
  },

  // Hesabu jumla ya admins (kuzuia kufuta admin wa mwisho)
  async countAdmins() {
    const [rows] = await db.execute(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'"
    )
    return rows[0].count
  }
}

module.exports = User
