const Purchase = require('../models/purchase')
const Product = require('../models/product')
const BusinessSettings = require('../models/businessSettings')

const purchaseController = {
  async create(req, res) {
    try {
      const settings = await BusinessSettings.get()
      if (settings?.business_type === 'pharmacy') return res.status(400).json({ message: 'Use Procurement GRN to receive pharmacy stock with its batch and expiry information' })
      const { product_id, quantity, cost_per_unit, supplier, notes } = req.body
      const user_id = req.user.id

      if (!product_id || !quantity || !cost_per_unit) {
        return res.status(400).json({ message: 'Product, quantity, and cost are required' })
      }

      const total_cost = parseFloat(quantity) * parseFloat(cost_per_unit)

      // Rekodi purchase
      const purchaseId = await Purchase.create(
        product_id, quantity, cost_per_unit, total_cost, supplier, notes, user_id
      )

      // Sasisha stock NA cost_price ya product
      // (last-cost method: cost_price = bei ya ununuzi wa mwisho)
      const product = await Product.findById(product_id)
      const newStock = parseInt(product.stock) + parseInt(quantity)
      await Product.update(
        product_id,
        product.name,
        product.description,
        product.price,
        parseFloat(cost_per_unit),
        newStock,
        product.unit,
        product.low_stock_alert,
        product.category
      )

      res.status(201).json({
        message: 'Purchase recorded successfully',
        purchaseId
      })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getAll(req, res) {
    try {
      const purchases = await Purchase.findAll()
      res.json(purchases)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getByProduct(req, res) {
    try {
      const purchases = await Purchase.findByProduct(req.params.product_id)
      res.json(purchases)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = purchaseController
