const express = require('express')
const router = express.Router()
const auditLogController = require('../controllers/auditLogController')
const { auth, requireRole } = require('../middleware/auth')

// Manager/Admin pekee - hii ni sensitive information
router.get('/', auth, requireRole('admin', 'manager'), auditLogController.getAll)
router.get('/:table/:id', auth, requireRole('admin', 'manager'), auditLogController.getByRecord)

module.exports = router
