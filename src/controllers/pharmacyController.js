const Pharmacy = require('../models/pharmacy')

const pharmacyController = {
  async batches(req, res) {
    try { res.json(await Pharmacy.listBatches(req.query)) }
    catch (err) { res.status(500).json({ message: 'Failed to load pharmacy batches', error: err.message }) }
  },
  async expirySummary(req, res) {
    try { res.json(await Pharmacy.getExpirySummary()) }
    catch (err) { res.status(500).json({ message: 'Failed to load expiry summary', error: err.message }) }
  },
  async eligibleBatches(req, res) {
    try {
      const productId = Number(req.query.product_id)
      if (!Number.isInteger(productId) || productId < 1) return res.status(400).json({ message: 'A valid product_id is required' })
      res.json(await Pharmacy.eligibleBatches(productId))
    } catch (err) { res.status(500).json({ message: 'Failed to load eligible batches', error: err.message }) }
  },
  async receive(req, res) {
    try { const id = await Pharmacy.receiveBatch({ ...req.body, user_id: req.user.id }); res.status(201).json({ id, message: 'Batch received and inventory updated' }) }
    catch (err) { res.status(400).json({ message: err.message }) }
  },
  async adjust(req, res) {
    try { await Pharmacy.adjustBatch({ ...req.body, batch_id: req.params.id, user_id: req.user.id }); res.json({ message: 'Batch adjustment saved' }) }
    catch (err) { res.status(400).json({ message: err.message }) }
  },
  async setStatus(req, res) {
    try { await Pharmacy.setBatchStatus({ ...req.body, batch_id: req.params.id, user_id: req.user.id }); res.json({ message: 'Batch status updated' }) }
    catch (err) { res.status(400).json({ message: err.message }) }
  },
  async updateBatchInfo(req, res) {
    try { await Pharmacy.updateBatchInfo({ ...req.body, batch_id: req.params.id, user_id: req.user.id }); res.json({ message: 'Batch details updated' }) }
    catch (err) { res.status(400).json({ message: err.message }) }
  },
  async movements(req, res) {
    try { res.json(await Pharmacy.movements(req.params.id)) }
    catch (err) { res.status(500).json({ message: 'Failed to load batch history', error: err.message }) }
  }
  ,
  async prescriptions(req, res) {
    try { res.json(await Pharmacy.listPrescriptions(req.query)) }
    catch (err) { res.status(500).json({ message: 'Failed to load prescriptions', error: err.message }) }
  },
  async createPrescription(req, res) {
    try { const result = await Pharmacy.createPrescription({ ...req.body, user_id: req.user.id }); res.status(201).json({ ...result, message: 'Prescription saved' }) }
    catch (err) { res.status(400).json({ message: err.message }) }
  }
}
module.exports = pharmacyController
