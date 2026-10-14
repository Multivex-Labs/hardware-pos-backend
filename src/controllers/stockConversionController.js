const StockConversion = require('../models/stockConversion')
const Product = require('../models/product')

const stockConversionController = {
  async getAll(req, res) {
    try {
      const rows = await StockConversion.findAll()
      res.json(rows)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async create(req, res) {
    try {
      const { from_product_id, from_quantity, to_product_id, to_quantity, reason } = req.body
      const performed_by = req.user.id

      if (!from_product_id || !to_product_id) {
        return res.status(400).json({ message: 'Chagua bidhaa ya chanzo na bidhaa lengwa' })
      }
      if (Number(from_product_id) === Number(to_product_id)) {
        return res.status(400).json({ message: 'Bidhaa ya chanzo na lengwa haziwezi kuwa sawa' })
      }
      if (!from_quantity || Number(from_quantity) <= 0) {
        return res.status(400).json({ message: 'Weka idadi sahihi ya kutoa' })
      }
      if (!to_quantity || Number(to_quantity) <= 0) {
        return res.status(400).json({ message: 'Weka idadi sahihi ya kuongeza' })
      }
      if (!reason || !reason.trim()) {
        return res.status(400).json({ message: 'Reason inahitajika' })
      }

      const fromProduct = await Product.findById(from_product_id)
      const toProduct = await Product.findById(to_product_id)
      if (!fromProduct || !toProduct) return res.status(404).json({ message: 'Bidhaa haikupatikana' })

      if (Number(fromProduct.stock) < Number(from_quantity)) {
        return res.status(400).json({ message: `Stock haitoshi kwa ${fromProduct.name} (ipo: ${fromProduct.stock} ${fromProduct.unit || ''})` })
      }

      const conversionId = await StockConversion.create({
        from_product_id, from_quantity: Number(from_quantity),
        to_product_id, to_quantity: Number(to_quantity),
        reason: reason.trim(), performed_by
      })

      res.status(201).json({
        message: `✓ ${from_quantity} ${fromProduct.unit || ''} za ${fromProduct.name} zimebadilishwa kuwa ${to_quantity} ${toProduct.unit || ''} za ${toProduct.name}`,
        conversionId
      })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = stockConversionController
