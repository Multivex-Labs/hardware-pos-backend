const Purchase = require('../models/Purchase')
const Product = require('../models/Product')

const purchaseController = {
  async create(req, res) {
    try {
      const { product_id, quantity, cost_per_unit, supplier, notes } = req.body
      const user_id = req.user.id

      if (!product_id || !quantity || !cost_per_unit) {
        return res.status(400).json({ message: 'Product, quantity, and cost are required' })
      }

      const total_cost = parseFloat(quantity) * parseFloat(cost_per_unit)

      // Create purchase record
      const purchaseId = await Purchase.create(
        product_id, quantity, cost_per_unit, total_cost, supplier, notes, user_id
      )

      // Update product stock
      const product = await Product.findById(product_id)
      const newStock = parseInt(product.stock) + parseInt(quantity)
      await Product.update(
        product_id,
        product.name,
        product.description,
        product.price,
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
