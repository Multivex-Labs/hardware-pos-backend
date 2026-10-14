const express = require('express')
const router = express.Router()
const stockMovementController = require('../controllers/stockMovementController')
const { auth, requireRole } = require('../middleware/auth')

router.use(auth)

// Kuona movement history - roles zote (admin, manager, cashier)
router.get('/', stockMovementController.getAll)
router.get('/product/:id', stockMovementController.getByProduct)

// Manual adjustment / damage - admin na manager TU, sawa na void sale
router.post('/adjustment', requireRole('admin', 'manager'), stockMovementController.createAdjustment)

module.exports = router
