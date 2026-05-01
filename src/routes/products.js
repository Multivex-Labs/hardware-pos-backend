const express = require('express')
const router = express.Router()
const productController = require('../controllers/productController')
const { auth, adminOnly } = require('../middleware/auth')

// Pata products zote — anyone aliyeingia
router.get('/', auth, productController.getAll)

// Pata low stock products
router.get('/lowstock', auth, productController.getLowStock)

// Pata product moja
router.get('/:id', auth, productController.getOne)

// Unda product mpya — admin peke yake
router.post('/', auth, adminOnly, productController.create)

// Edit product — admin peke yake
router.put('/:id', auth, adminOnly, productController.update)

// Futa product — admin peke yake
router.delete('/:id', auth, adminOnly, productController.delete)

module.exports = router