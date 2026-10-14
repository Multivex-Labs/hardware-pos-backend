const express = require('express')
const router = express.Router()
const dispensingLogController = require('../controllers/dispensingLogController')
const { auth } = require('../middleware/auth')

router.use(auth)

// Roles zote zenye access (admin/manager/cashier) zinaweza ku-dispense na kuona
// register - hakuna requireRole maalum hapa (mfanyakazi yeyote wa duka anaweza
// kutoa dawa kwenye counter)
router.get('/', dispensingLogController.getAll)
router.post('/', dispensingLogController.create)

module.exports = router
