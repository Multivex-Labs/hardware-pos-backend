const Report = require('../models/report')

const reportController = {
  // Summary ya leo
  async getToday(req, res) {
    try {
      const summary = await Report.todaySummary()
      res.json(summary)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Summary ya mwezi
  async getMonthly(req, res) {
    try {
      const { year, month } = req.params
      const summary = await Report.monthlySummary(year, month)
      res.json(summary)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Best selling products
  async getBestSelling(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10
      const products = await Report.bestSellingProducts(limit)
      res.json(products)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Sales kwa payment method
  async getByPaymentMethod(req, res) {
    try {
      const data = await Report.salesByPaymentMethod()
      res.json(data)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Sales siku 7 zilizopita
  async getLastSevenDays(req, res) {
    try {
      const data = await Report.lastSevenDays()
      res.json(data)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = reportController