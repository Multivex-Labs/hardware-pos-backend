const DispensingLog = require('../models/dispensingLog')
const Product = require('../models/product')

const dispensingLogController = {
  async getAll(req, res) {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100))
      res.json(await DispensingLog.findAll({ limit }))
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async create(req, res) {
    try {
      const { product_id, quantity_dispensed, patient_name, prescriber_name, dosage_instructions, request_key } = req.body || {}
      if (!Number.isInteger(Number(product_id)) || Number(product_id) < 1 || !Number.isFinite(Number(quantity_dispensed)) || Number(quantity_dispensed) <= 0) {
        return res.status(400).json({ message: 'Chagua bidhaa na weka quantity sahihi' })
      }
      if (request_key !== undefined && (typeof request_key !== 'string' || request_key.length < 8 || request_key.length > 100)) {
        return res.status(400).json({ message: 'Invalid dispensing request key' })
      }
      const product = await Product.findById(product_id)
      if (!product) return res.status(404).json({ message: 'Bidhaa haikupatikana' })
      const result = await DispensingLog.create({
        product_id: Number(product_id), quantity_dispensed: Number(quantity_dispensed),
        patient_name, prescriber_name, dosage_instructions,
        dispensed_by: req.user.id, request_key
      })
      res.status(201).json({
        message: result.duplicate ? 'This dispensing request was already processed' : `${quantity_dispensed} ${product.unit || ''} za ${product.name} zimetolewa`,
        logId: result.id, duplicate: result.duplicate
      })
    } catch (error) {
      res.status(error.statusCode || 400).json({ message: error.message })
    }
  }
}

module.exports = dispensingLogController
