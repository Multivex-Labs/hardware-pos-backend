const Expense = require('../models/expense')

const expenseController = {
  async create(req, res) {
    try {
      const { category, description, amount, expense_date } = req.body
      const recorded_by = req.user.id

      if (!category || !amount || Number(amount) <= 0) {
        return res.status(400).json({ message: 'Weka category na kiasi sahihi (zaidi ya 0)' })
      }

      const date = expense_date || new Date().toISOString().slice(0, 10)
      const expenseId = await Expense.create(category, description, Number(amount), date, recorded_by)

      res.status(201).json({ message: 'Expense imerekodiwa successfully', expenseId })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getAll(req, res) {
    try {
      const expenses = await Expense.findAll()
      res.json(expenses)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getOne(req, res) {
    try {
      const expense = await Expense.findById(req.params.id)
      if (!expense) return res.status(404).json({ message: 'Expense haikupatikana' })
      res.json(expense)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getByMonth(req, res) {
    try {
      const { year, month } = req.params
      const expenses = await Expense.findByMonth(year, month)
      const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)
      res.json({ expenses, total_month: total.toFixed(2) })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async update(req, res) {
    try {
      const { category, description, amount, expense_date } = req.body
      if (!category || !amount || Number(amount) <= 0) {
        return res.status(400).json({ message: 'Weka category na kiasi sahihi' })
      }
      const affected = await Expense.update(req.params.id, category, description, Number(amount), expense_date)
      if (!affected) return res.status(404).json({ message: 'Expense haikupatikana' })
      res.json({ message: 'Expense imebadilishwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async delete(req, res) {
    try {
      const affected = await Expense.delete(req.params.id)
      if (!affected) return res.status(404).json({ message: 'Expense haikupatikana' })
      res.json({ message: 'Expense imefutwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = expenseController
