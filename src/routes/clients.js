const express = require('express')
const router = express.Router()
const clientController = require('../controllers/clientController')
const { auth, adminOnly } = require('../middleware/auth')

// Pata clients zote
router.get('/', auth, clientController.getAll)

// Tafuta client
router.get('/search', auth, clientController.search)

// Pata purchase history ya client
router.get('/:id/history', auth, clientController.getPurchaseHistory)

// Pata client moja
router.get('/:id', auth, clientController.getOne)

// Unda client mpya
router.post('/', auth, clientController.create)

// Edit client
router.put('/:id', auth, clientController.update)

// Futa client — admin peke yake
router.delete('/:id', auth, adminOnly, clientController.delete)

// Pata profile kamili na stats za client
router.get('/:id/profile', auth, clientController.getProfile)

// Historia ya malipo
router.get('/:id/payments', auth, clientController.getPaymentHistory)

// Rekodi malipo mapya
router.post('/:id/payments', auth, clientController.recordPayment)

// Badilisha credit limit
router.patch('/:id/credit-limit', auth, clientController.updateCreditLimit)

module.exports = router