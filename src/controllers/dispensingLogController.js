const DispensingLog = require('../models/dispensingLog')
const Product = require('../models/product')

const dispensingLogController = {
  async getAll(req, res) {
    try {
      const rows = await DispensingLog.findAll({ limit: req.query.limit })
      res.json(rows)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async create(req, res) {
    try {
      const { product_id, quantity_dispensed, patient_name, prescriber_name, dosage_instructions } = req.body
      const dispensed_by = req.user.id

      if (!product_id || !quantity_dispensed || Number(quantity_dispensed) <= 0) {
        return res.status(400).json({ message: 'Chagua bidhaa na weka quantity sahihi' })
      }

      const product = await Product.findById(product_id)
      if (!product) return res.status(404).json({ message: 'Bidhaa haikupatikana' })

      if (Number(product.stock) < Number(quantity_dispensed)) {
        return res.status(400).json({ message: `Stock haitoshi kwa ${product.name} (ipo: ${product.stock} ${product.unit || ''})` })
      }

      // batch_number inachukuliwa moja kwa moja kutoka kwa product ya SASA
      // (single-batch-per-product model) - inahifadhiwa kama snapshot kwenye log
      const logId = await DispensingLog.create({
        product_id,
        batch_number: product.batch_number,
        quantity_dispensed: Number(quantity_dispensed),
        patient_name, prescriber_name, dosage_instructions,
        dispensed_by
      })

      res.status(201).json({
        message: `✓ ${quantity_dispensed} ${product.unit || ''} za ${product.name} zimetolewa`,
        logId
      })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = dispensingLogController
