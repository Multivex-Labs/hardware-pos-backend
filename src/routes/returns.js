const express = require('express')
const router = express.Router()
const returnController = require('../controllers/returnController')
const { auth } = require('../middleware/auth')

// Fanya return/refund
router.post('/', auth, returnController.create)

// Orodha ya returns zote
router.get('/', auth, returnController.getAll)

// Return moja na items zake
router.get('/:id', auth, returnController.getOne)

module.exports = router
