const express = require('express')
const router = express.Router()
const reportController = require('../controllers/reportController')
const { auth, adminOnly } = require('../middleware/auth')

router.get('/today', auth, adminOnly, reportController.getToday)
router.get('/monthly/:year/:month', auth, adminOnly, reportController.getMonthly)
router.get('/best-selling', auth, adminOnly, reportController.getBestSelling)
router.get('/payment-methods', auth, adminOnly, reportController.getByPaymentMethod)
router.get('/last-seven-days', auth, adminOnly, reportController.getLastSevenDays)

module.exports = router