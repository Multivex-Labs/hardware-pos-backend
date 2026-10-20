const db = require('../config/database')

const BusinessSettings = {
  async get() {
    const [rows] = await db.execute('SELECT * FROM business_settings WHERE id = 1')
    return rows[0]
  },

  async update(fields) {
    const allowed = [
      'business_name', 'logo', 'address', 'phone', 'motto',
      'tin_number', 'bank_name', 'bank_account', 'bank_branch', 'business_type'
    ]
    const sets = allowed.map(f => `${f}=?`).join(', ')
    const values = allowed.map(f => fields[f] !== undefined ? fields[f] : null)
    values.push(1) // WHERE id = 1
    const [result] = await db.execute(
      `UPDATE business_settings SET ${sets} WHERE id = 1`,
      values
    )
    return result.affectedRows
  }
}

module.exports = BusinessSettings
