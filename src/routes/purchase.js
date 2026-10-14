const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const purchasesController = require('../controllers/purchases');

router.use(auth);

// Procurement is an admin/manager domain — cashiers don't need access here.
router.get('/', requireRole('admin', 'manager'), purchasesController.listPurchases);
router.get('/summary', requireRole('admin', 'manager'), purchasesController.getTotalsSummary);
router.get('/:id', requireRole('admin', 'manager'), purchasesController.getPurchase);
router.post('/', requireRole('admin', 'manager'), purchasesController.createPurchase);

module.exports = router;
