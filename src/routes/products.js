const express = require('express')
const router = express.Router()
const productController = require('../controllers/productController')
const { auth, adminOnly } = require('../middleware/auth')

// ⚠️ MUHIMU: routes zenye maneno maalum (units/all, lowstock, expiring-soon)
// lazima ziwe KABLA ya '/:id' - vinginevyo Express itadhani ni product id.

router.get('/units/all', auth, productController.getAllUnits)
router.get('/lowstock', auth, productController.getLowStock)
router.get('/expiring-soon', auth, productController.getExpiringSoon) // MPYA - Pharmacy

router.get('/', auth, productController.getAll)

router.get('/:id/units', auth, productController.getUnits)
router.post('/:id/units', auth, adminOnly, productController.createUnit)
router.put('/:id/units/:unitId', auth, adminOnly, productController.updateUnit)
router.delete('/:id/units/:unitId', auth, adminOnly, productController.deleteUnit)

router.get('/:id', auth, productController.getOne)
router.post('/', auth, adminOnly, productController.create)
router.put('/:id', auth, adminOnly, productController.update)
router.delete('/:id', auth, adminOnly, productController.delete)

module.exports = router
