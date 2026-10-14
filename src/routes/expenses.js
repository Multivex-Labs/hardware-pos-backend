const express = require('express')
const router = express.Router()
const expenseController = require('../controllers/expenseController')
const { auth, adminOnly } = require('../middleware/auth')

router.post('/', auth, adminOnly, expenseController.create)
router.get('/', auth, adminOnly, expenseController.getAll)
router.get('/month/:year/:month', auth, adminOnly, expenseController.getByMonth)
router.get('/:id', auth, adminOnly, expenseController.getOne)
router.put('/:id', auth, adminOnly, expenseController.update)
router.delete('/:id', auth, adminOnly, expenseController.delete)

module.exports = router
