const Sale = require('../models/sale')
const Product = require('../models/product')

const saleController = {
  // Fanya sale mpya
  async create(req, res) {
    try {
      const { client_id, items, discount, payment_method } = req.body
      const user_id = req.user.id

      // Validate items
      if (!items || items.length === 0) {
        return res.status(400).json({ message: 'Ongeza bidhaa angalau moja' })
      }

      // Check stock na hesabu total
      let total = 0
      for (const item of items) {
        const product = await Product.findById(item.product_id)

        if (!product) {
          return res.status(404).json({ 
            message: `Product yenye id ${item.product_id} haikupatikana` 
          })
        }

        if (product.stock < item.quantity) {
          return res.status(400).json({ 
            message: `Stock haitoshi kwa ${product.name} — ipo ${product.stock} tu` 
          })
        }

        total += product.price * item.quantity
        item.price = product.price
      }

      // Punguza discount
      const finalTotal = total - (discount || 0)

      // Unda sale
      const saleId = await Sale.create(
        client_id || null,
        user_id,
        finalTotal,
        discount || 0,
        payment_method || 'cash'
      )

      // Ongeza items
      await Sale.addItems(saleId, items)

      // Punguza stock ya kila product
      for (const item of items) {
        await Product.decreaseStock(item.product_id, item.quantity)
      }

      res.status(201).json({
        message: 'Sale imefanyika successfully',
        saleId,
        total: finalTotal
      })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Pata sales zote
  async getAll(req, res) {
    try {
      const sales = await Sale.findAll()
      res.json(sales)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Pata sale moja na items
  async getOne(req, res) {
    try {
      const result = await Sale.findById(req.params.id)
      if (!result.sale) {
        return res.status(404).json({ message: 'Sale haikupatikana' })
      }
      res.json(result)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Pata sales za leo
  async getToday(req, res) {
    try {
      const sales = await Sale.findToday()
      const total = sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0)
      res.json({ sales, total_today: total.toFixed(2) })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Pata report ya mwezi
  async getByMonth(req, res) {
    try {
      const { year, month } = req.params
      const sales = await Sale.findByMonth(year, month)
      const total = sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0)
      res.json({ sales, total_month: total.toFixed(2) })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = saleController