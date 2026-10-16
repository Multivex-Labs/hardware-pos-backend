const express = require('express')
const router = express.Router()
const controller = require('../controllers/pharmacyController')
const { auth, pharmacyOnly } = require('../middleware/auth')

router.use(auth, pharmacyOnly)
router.get('/batches', controller.batches)
router.get('/expiry-summary', controller.expirySummary)
router.get('/eligible-batches', controller.eligibleBatches)
router.get('/prescriptions', controller.prescriptions)
router.post('/prescriptions', controller.createPrescription)
router.get('/batches/:id/movements', controller.movements)
router.post('/batches/receive', controller.receive)
router.post('/batches/:id/adjustment', controller.adjust)
router.put('/batches/:id', controller.updateBatchInfo)
router.patch('/batches/:id/status', controller.setStatus)

module.exports = router
