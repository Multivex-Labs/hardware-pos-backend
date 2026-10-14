const express = require('express')
const router = express.Router()
const c = require('../controllers/procurementController')
const { auth, adminOnly } = require('../middleware/auth')

// Vendors
router.get('/vendors', auth, c.getAllVendors)
router.post('/vendors', auth, adminOnly, c.createVendor)
router.put('/vendors/:id', auth, adminOnly, c.updateVendor)
router.delete('/vendors/:id', auth, adminOnly, c.deleteVendor)

// Vendor Payments (MPYA)
router.get('/vendor-payments/:vendorId', auth, c.listVendorPayments)
router.post('/vendor-payments', auth, adminOnly, c.createVendorPayment)

// Purchase Orders
router.get('/orders', auth, c.getAllPOs)
router.get('/orders/:id', auth, c.getPO)
router.post('/orders', auth, adminOnly, c.createPO)
router.patch('/orders/:id/status', auth, adminOnly, c.updatePOStatus)

// GRN
router.get('/grn', auth, c.getAllGRNs)
router.get('/grn/:id', auth, c.getGRN)
router.post('/grn/receive', auth, adminOnly, c.receiveGoods)

module.exports = router
