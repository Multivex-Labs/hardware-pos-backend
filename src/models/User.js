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
  }
}

module.exports = User