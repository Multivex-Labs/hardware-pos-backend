const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const vendorPaymentsController = require('../controllers/vendorPayments');

router.use(auth);

router.get('/vendor/:vendorId', requireRole('admin', 'manager'), vendorPaymentsController.listVendorPayments);
router.post('/', requireRole('admin', 'manager'), vendorPaymentsController.createVendorPayment);

module.exports = router;
