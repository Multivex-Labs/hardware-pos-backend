const express = require('express')
const router = express.Router()
const reportController = require('../controllers/reportController')
const { auth } = require('../middleware/auth')

router.get('/today', auth, reportController.getToday)
router.get('/monthly/:year/:month', auth, reportController.getMonthly)
router.get('/best-selling', auth, reportController.getBestSelling)
router.get('/payment-methods', auth, reportController.getByPaymentMethod)
router.get('/last-seven-days', auth, reportController.getLastSevenDays)

module.exports = router