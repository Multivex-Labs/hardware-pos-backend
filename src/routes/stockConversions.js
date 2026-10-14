const express = require('express')
const router = express.Router()
const stockConversionController = require('../controllers/stockConversionController')
const { auth, requireRole } = require('../middleware/auth')

router.use(auth)

router.get('/', stockConversionController.getAll)
router.post('/', requireRole('admin', 'manager'), stockConversionController.create)

module.exports = router
