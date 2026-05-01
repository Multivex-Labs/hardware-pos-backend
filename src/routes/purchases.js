const express = require('express')
const router = express.Router()
const purchaseController = require('../controllers/purchaseController')
const { auth, adminOnly } = require('../middleware/auth')

router.post('/', auth, adminOnly, purchaseController.create)
router.get('/', auth, purchaseController.getAll)
router.get('/product/:product_id', auth, purchaseController.getByProduct)

module.exports = router