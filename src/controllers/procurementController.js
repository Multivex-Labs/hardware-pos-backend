const Vendor = require('../models/vendor')
const { PurchaseOrder, GRN } = require('../models/procurement')
const VendorPayment = require('../models/vendorPayment')

const procurementController = {
  // ── VENDORS ────────────────────────────────────────────────────────────────
  async getAllVendors(req, res) {
    try { res.json(await Vendor.findAll()) }
    catch (err) { res.status(500).json({ message: 'Server error', error: err.message }) }
  },

  async createVendor(req, res) {
    try {
      const { name, contact_person, phone, email, address, notes } = req.body
      if (!name) return res.status(400).json({ message: 'Jina la vendor ni lazima' })
      const id = await Vendor.create(name, contact_person, phone, email, address, notes)
      res.status(201).json({ message: 'Vendor ameundwa successfully', id })
    } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }) }
  },

  async updateVendor(req, res) {
    try {
      const { name, contact_person, phone, email, address, notes } = req.body
      if (!name) return res.status(400).json({ message: 'Jina la vendor ni lazima' })
      const affected = await Vendor.update(req.params.id, name, contact_person, phone, email, address, notes)
      if (!affected) return res.status(404).json({ message: 'Vendor haikupatikana' })
      res.json({ message: 'Vendor imesasishwa successfully' })
    } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }) }
  },

  async deleteVendor(req, res) {
    try {
      const affected = await Vendor.delete(req.params.id)
      if (!affected) return res.status(404).json({ message: 'Vendor haikupatikana' })
      res.json({ message: 'Vendor imefutwa successfully' })
    } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }) }
  },

  // ── VENDOR PAYMENTS (MPYA) ───────────────────────────────────────────────────
  async createVendorPayment(req, res) {
    try {
      const { vendor_id, amount, payment_method, notes } = req.body
      if (!vendor_id || !amount || Number(amount) <= 0) {
        return res.status(400).json({ message: 'vendor_id na amount sahihi (zaidi ya 0) ni lazima' })
      }
      const result = await VendorPayment.create({
        vendor_id, amount, payment_method, notes, recorded_by: req.user.id
      })
      res.status(201).json({ message: 'Malipo yamesajiliwa successfully', ...result })
    } catch (err) { res.status(500).json({ message: err.message || 'Server error' }) }
  },

  async listVendorPayments(req, res) {
    try { res.json(await VendorPayment.findByVendor(req.params.vendorId)) }
    catch (err) { res.status(500).json({ message: 'Server error', error: err.message }) }
  },

  // ── PURCHASE ORDERS ────────────────────────────────────────────────────────
  async getAllPOs(req, res) {
    try { res.json(await PurchaseOrder.findAll()) }
    catch (err) { res.status(500).json({ message: 'Server error', error: err.message }) }
  },

  async getPO(req, res) {
    try {
      const result = await PurchaseOrder.findById(req.params.id)
      if (!result.po) return res.status(404).json({ message: 'PO haikupatikana' })
      res.json(result)
    } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }) }
  },

  async createPO(req, res) {
    try {
      const { vendor_id, expected_date, notes, items } = req.body
      if (!items || items.length === 0) return res.status(400).json({ message: 'Ongeza bidhaa angalau moja kwenye PO' })

      const { id, po_number } = await PurchaseOrder.create(vendor_id, expected_date, notes, req.user.id)

      for (const item of items) {
        if (!item.product_name || !item.quantity_ordered || !item.unit_cost) {
          return res.status(400).json({ message: 'Kila bidhaa inahitaji jina, quantity na bei' })
        }
        await PurchaseOrder.addItem(id, item.product_id || null, item.product_name, item.quantity_ordered, item.unit_cost)
      }

      res.status(201).json({ message: `PO ${po_number} imeundwa successfully`, id, po_number })
    } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }) }
  },

  async updatePOStatus(req, res) {
    try {
      const { status } = req.body
      const allowed = ['draft', 'sent', 'partial', 'received', 'cancelled']
      if (!allowed.includes(status)) return res.status(400).json({ message: 'Status si sahihi' })
      await PurchaseOrder.updateStatus(req.params.id, status)
      res.json({ message: 'Status imebadilishwa' })
    } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }) }
  },

  // ── GRN ───────────────────────────────────────────────────────────────────
  async getAllGRNs(req, res) {
    try { res.json(await GRN.findAll()) }
    catch (err) { res.status(500).json({ message: 'Server error', error: err.message }) }
  },

  async getGRN(req, res) {
    try {
      const result = await GRN.findById(req.params.id)
      if (!result.grn) return res.status(404).json({ message: 'GRN haikupatikana' })
      res.json(result)
    } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }) }
  },

  async receiveGoods(req, res) {
    try {
      const { po_id, vendor_id, payment_type, amount_paid, received_date, notes, items } = req.body
      if (!items || items.length === 0) return res.status(400).json({ message: 'Ongeza bidhaa angalau moja' })
      if (!received_date) return res.status(400).json({ message: 'Weka tarehe ya kupokea' })
      if (payment_type && !['cash', 'credit'].includes(payment_type)) {
        return res.status(400).json({ message: 'payment_type lazima iwe cash au credit' })
      }
      if (payment_type === 'credit' && !vendor_id && !po_id) {
        return res.status(400).json({ message: 'Manunuzi ya mkopo yanahitaji vendor' })
      }

      const { grn_id, grn_number } = await GRN.receive({
        po_id,
        vendor_id,
        payment_type: payment_type || 'cash',
        amount_paid,
        received_date,
        notes,
        items,
        received_by: req.user.id
      })

      res.status(201).json({
        message: `Bidhaa zimepokelewa! GRN ${grn_number} imeundwa. Stock imesasishwa.`,
        grn_id, grn_number
      })
    } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }) }
  }
}

module.exports = procurementController
