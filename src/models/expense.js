const db = require('../config/database')

const Expense = {
  async create(category, description, amount, expense_date, recorded_by) {
    const [result] = await db.execute(
      'INSERT INTO expenses (category, description, amount, expense_date, recorded_by) VALUES (?, ?, ?, ?, ?)',
      [category, description || null, amount, expense_date, recorded_by]
    )
    return result.insertId
  },

  async findAll() {
    const [rows] = await db.execute(
      `SELECT e.*, u.name as recorded_by_name
       FROM expenses e
       LEFT JOIN users u ON e.recorded_by = u.id
       ORDER BY e.expense_date DESC, e.created_at DESC`
    )
    return rows
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM expenses WHERE id = ?', [id])
    return rows[0]
  },

  async findByMonth(year, month) {
    const [rows] = await db.execute(
      `SELECT e.*, u.name as recorded_by_name
       FROM expenses e
       LEFT JOIN users u ON e.recorded_by = u.id
       WHERE YEAR(e.expense_date) = ? AND MONTH(e.expense_date) = ?
       ORDER BY e.expense_date DESC`,
      [year, month]
    )
    return rows
  },

  async update(id, category, description, amount, expense_date) {
    const [result] = await db.execute(
      'UPDATE expenses SET category=?, description=?, amount=?, expense_date=? WHERE id=?',
      [category, description || null, amount, expense_date, id]
    )
    return result.affectedRows
  },

  async delete(id) {
    const [result] = await db.execute('DELETE FROM expenses WHERE id = ?', [id])
    return result.affectedRows
  }
}

module.exports = Expense
