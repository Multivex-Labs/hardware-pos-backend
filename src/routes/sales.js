const express = require('express')
const router = express.Router()
const saleController = require('../controllers/saleController')
const { auth, requireRole } = require('../middleware/auth')

// Cash sale (kawaida)
router.post('/', auth, saleController.create)

// Credit sale (mkopo)
router.post('/credit', auth, saleController.createCreditSale)

// Deposit sale (kutumia amana)
router.post('/deposit-sale', auth, saleController.createDepositSale)

// Weka amana ya client
router.post('/add-deposit', auth, saleController.addDeposit)

// Void/Cancel Sale - Manager/Admin pekee (server-side enforced)
router.post('/:id/void', auth, requireRole('admin', 'manager'), saleController.voidSale)

// Edit Receipt - Manager/Admin pekee (server-side enforced)
router.put('/:id/edit', auth, requireRole('admin', 'manager'), saleController.editReceipt)

// Queries
// ⚠️ '/deposit-history' lazima iwe KABLA ya '/:id'
router.get('/deposit-history', auth, saleController.getDepositHistory)
router.get('/', auth, saleController.getAll)
router.get('/today', auth, saleController.getToday)
router.get('/month/:year/:month', auth, saleController.getByMonth)
router.get('/:id/returnable', auth, saleController.getReturnable)
router.get('/:id', auth, saleController.getOne)

module.exports = router
