const db = require('../config/database')

const AuditLog = {
  // conn (hiari) - ikitolewa, hii inashiriki transaction ya kitu kingine (mfano Sale.voidSale)
  async create(user_id, action_type, table_affected, record_id, reason, old_value, new_value, conn) {
    const connection = conn || db
    await connection.execute(
      'INSERT INTO audit_logs (user_id, action_type, table_affected, record_id, reason, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        user_id, action_type, table_affected, record_id, reason || null,
        old_value ? JSON.stringify(old_value) : null,
        new_value ? JSON.stringify(new_value) : null
      ]
    )
  },

  async findAll(limit = 200) {
    const safeLimit = Math.min(parseInt(limit) || 200, 1000)
    const [rows] = await db.execute(
      `SELECT al.*, u.name as user_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT ${safeLimit}`
    )
    return rows
  },

  async findByRecord(table_affected, record_id) {
    const [rows] = await db.execute(
      `SELECT al.*, u.name as user_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.table_affected = ? AND al.record_id = ?
       ORDER BY al.created_at DESC`,
      [table_affected, record_id]
    )
    return rows
  }
}

module.exports = AuditLog
