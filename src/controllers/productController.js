const Product = require('../models/product')

const productController = {
  async getAll(req, res) {
    try {
      const products = await Product.findAll()
      res.json(products)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getOne(req, res) {
    try {
      const product = await Product.findById(req.params.id)
      if (!product) {
        return res.status(404).json({ message: 'Product haikupatikana' })
      }
      res.json(product)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async create(req, res) {
    try {
      const { name, description, price, stock, unit, low_stock_alert, category } = req.body

      if (!name || !price) {
        return res.status(400).json({ message: 'Jina na bei ni lazima' })
      }

      const productId = await Product.create(
        name, description, price, stock, unit || 'PC', low_stock_alert || 5, category
      )

      res.status(201).json({ 
        message: 'Product imeundwa successfully',
        productId 
      })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async update(req, res) {
    try {
      const { name, description, price, stock, unit, low_stock_alert, category } = req.body
      const product = await Product.findById(req.params.id)

      if (!product) {
        return res.status(404).json({ message: 'Product haikupatikana' })
      }

      await Product.update(
        req.params.id,
        name || product.name,
        description || product.description,
        price || product.price,
        stock ?? product.stock,
        unit || product.unit,
        low_stock_alert || product.low_stock_alert,
        category || product.category
      )

      res.json({ message: 'Product imebadilishwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async delete(req, res) {
    try {
      const product = await Product.findById(req.params.id)
      if (!product) {
        return res.status(404).json({ message: 'Product haikupatikana' })
      }

      await Product.delete(req.params.id)
      res.json({ message: 'Product imefutwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getLowStock(req, res) {
    try {
      const products = await Product.findLowStock()
      res.json(products)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = productController