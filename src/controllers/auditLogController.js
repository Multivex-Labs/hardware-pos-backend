const AuditLog = require('../models/auditLog')

const auditLogController = {
  async getAll(req, res) {
    try {
      const { limit } = req.query
      const logs = await AuditLog.findAll(limit)
      res.json(logs)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getByRecord(req, res) {
    try {
      const { table, id } = req.params
      const logs = await AuditLog.findByRecord(table, id)
      res.json(logs)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = auditLogController
