const express = require('express')
const router = express.Router()
const productImportController = require('../controllers/productImportController')
const { auth, adminOnly } = require('../middleware/auth')

// Imesajiliwa KABLA ya /api/products kwenye server.js, ili '/import' isichukuliwe kama '/:id'.
// permissionGate (server.js) tayari inakagua 'inventory:create' kwa POST /products/import/*,
// adminOnly hapa ni ulinzi wa pili (admin au mtu mwenye ruhusa).
router.post('/preview', auth, adminOnly, productImportController.preview)
router.post('/', auth, adminOnly, productImportController.importProducts)

module.exports = router
