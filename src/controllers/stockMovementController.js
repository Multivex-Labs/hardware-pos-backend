const StockMovement = require('../models/stockMovement')
const Pharmacy = require('../models/pharmacy')
const BusinessSettings = require('../models/businessSettings')

const stockMovementController = {
  // GET /api/stock-movements?product_id=&movement_type=&date_from=&date_to=&page=&limit=
  async getAll(req, res) {
    try {
      const { product_id, movement_type, date_from, date_to, page, limit } = req.query
      const result = await StockMovement.findAll({ product_id, movement_type, date_from, date_to, page, limit })
      res.json(result)
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message })
    }
  },

  // GET /api/stock-movements/product/:id
  async getByProduct(req, res) {
    try {
      const { page, limit } = req.query
      const result = await StockMovement.findByProduct(req.params.id, { page, limit })
      res.json(result)
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message })
    }
  },

  // POST /api/stock-movements/adjustment
  // Body: { product_id, quantity_change, reason, movement_type? }
  // Role-protected (admin/manager) kwenye routes file - sawa na void sale
  async createAdjustment(req, res) {
    try {
      const { product_id, quantity_change, reason, movement_type } = req.body
      const performed_by = req.user.id

      if (!product_id || quantity_change === undefined || Number(quantity_change) === 0) {
        return res.status(400).json({ message: 'product_id na quantity_change (isiyokuwa 0) zinahitajika' })
      }
      if (!reason || !reason.trim()) {
        return res.status(400).json({ message: 'Reason inahitajika kwa stock adjustment au damage yoyote' })
      }

      // movement_type inaruhusiwa 'adjustment' au 'damage' pekee kupitia endpoint hii ya manual.
      // Aina nyingine (sale, purchase, n.k.) zinatoka moja kwa moja kwenye flow zake.
      const allowed = ['adjustment', 'damage']
      const type = allowed.includes(movement_type) ? movement_type : 'adjustment'

      const settings = await BusinessSettings.get()
      if (settings?.business_type === 'pharmacy') {
        if (!req.body.batch_id) return res.status(400).json({ message: 'Pharmacy adjustments must identify a batch' })
        await Pharmacy.adjustBatch({ batch_id: req.body.batch_id, quantity_change: Number(quantity_change), reason, user_id: performed_by, movement_type: type })
        return res.status(201).json({ message: 'Batch adjustment imefanikiwa' })
      }

      const movement = await StockMovement.log({
        product_id,
        movement_type: type,
        quantity_change: Number(quantity_change),
        reference_type: 'manual',
        reference_id: null,
        reason,
        performed_by
      })

      res.status(201).json({ message: 'Adjustment imefanikiwa', movement })
    } catch (err) {
      res.status(400).json({ message: err.message })
    }
  }
}

module.exports = stockMovementController
