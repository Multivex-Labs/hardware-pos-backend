const Return = require('../models/return')
const Sale = require('../models/sale')

const returnController = {

  async create(req, res) {
    try {
      const { sale_id, client_id, refund_method, reason, notes, items } = req.body
      const processed_by = req.user.id

      if (!sale_id) return res.status(400).json({ message: 'Chagua risiti (sale) ya kurudisha' })
      if (!items || items.length === 0) return res.status(400).json({ message: 'Chagua bidhaa angalau moja ya kurudisha' })

      const saleResult = await Sale.findById(sale_id)
      if (!saleResult.sale) return res.status(404).json({ message: 'Sale haikupatikana' })

      const returnedMap = await Return.getReturnedQtyMap(sale_id)

      // Validate kila item: haiwezi kuzidi kilichouzwa - kilichokwisha rudishwa
      for (const item of items) {
        const soldItem = saleResult.items.find(si => si.sale_item_id === item.sale_item_id)
        if (!soldItem) return res.status(400).json({ message: `Sale item ${item.sale_item_id} haikupatikana kwenye risiti hii` })

        const alreadyReturned = returnedMap[item.sale_item_id] || 0
        const maxReturnable = soldItem.quantity - alreadyReturned

        if (!item.quantity_returned || item.quantity_returned <= 0) {
          return res.status(400).json({ message: `Weka idadi sahihi ya kurudisha kwa ${soldItem.product_name}` })
        }
        if (item.quantity_returned > maxReturnable) {
          return res.status(400).json({ message: `Umezidisha! ${soldItem.product_name}: inayoweza kurudishwa ni ${maxReturnable} tu` })
        }

        // Tumia bei ya kwenye risiti halisi (sio ile iliyotumwa na frontend - usalama)
        item.price = soldItem.price
        item.product_id = soldItem.product_id
      }

      const finalRefundMethod = refund_method || 'cash'
      const finalClientId = client_id || saleResult.sale.client_id || null

      if (finalRefundMethod === 'store_credit' && !finalClientId) {
        return res.status(400).json({ message: 'Store Credit inahitaji risiti iwe na client aliyesajiliwa (sio Walk-in)' })
      }

      const result = await Return.processReturn({
        sale_id,
        client_id: finalClientId,
        processed_by,
        refund_method: finalRefundMethod,
        reason,
        notes,
        items
      })

      res.status(201).json({
        message: `✓ Return imefanyika! Refund: TZS ${result.total_refund.toLocaleString()}`,
        returnId: result.returnId,
        total_refund: result.total_refund
      })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getAll(req, res) {
    try {
      const returns = await Return.findAll()
      res.json(returns)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getOne(req, res) {
    try {
      const result = await Return.findById(req.params.id)
      if (!result.return) return res.status(404).json({ message: 'Return haikupatikana' })
      res.json(result)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = returnController
