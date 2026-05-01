const express = require('express')
const router = express.Router()
const saleController = require('../controllers/saleController')
const { auth } = require('../middleware/auth')

router.post('/', auth, saleController.create)
router.get('/', auth, saleController.getAll)
router.get('/today', auth, saleController.getToday)
router.get('/month/:year/:month', auth, saleController.getByMonth)
router.get('/:id', auth, saleController.getOne)

module.exports = router