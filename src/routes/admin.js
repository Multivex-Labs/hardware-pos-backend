const express = require('express')
const router = express.Router()
const db = require('../config/database')
const { auth, adminOnly } = require('../middleware/auth')

// POST /api/admin/clear-all — Admin only
router.post('/clear-all', auth, adminOnly, async (req, res) => {
  try {
    await db.execute('SET FOREIGN_KEY_CHECKS = 0')
    await db.execute('TRUNCATE TABLE sale_items')
    await db.execute('TRUNCATE TABLE sales')
    await db.execute('TRUNCATE TABLE purchases')
    await db.execute('TRUNCATE TABLE clients')
    await db.execute('TRUNCATE TABLE products')
    await db.execute('SET FOREIGN_KEY_CHECKS = 1')

    res.json({ success: true, message: 'All data cleared successfully.' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
