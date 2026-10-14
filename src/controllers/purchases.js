const Purchase = require('../models/purchase');

exports.createPurchase = async (req, res) => {
  try {
    const { vendor_id, payment_type, amount_paid, notes, items } = req.body;

    if (!vendor_id) {
      return res.status(400).json({ message: 'Vendor is required' });
    }
    if (!['cash', 'credit'].includes(payment_type)) {
      return res.status(400).json({ message: 'payment_type must be cash or credit' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one item is required' });
    }
    for (const item of items) {
      if (!item.product_id || !item.quantity || !item.cost_per_unit) {
        return res.status(400).json({ message: 'Each item needs product_id, quantity, cost_per_unit' });
      }
    }

    const result = await Purchase.createWithItems({
      vendor_id,
      payment_type,
      amount_paid,
      notes,
      recorded_by: req.user.id,
      items,
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('createPurchase error:', err);
    res.status(500).json({ message: 'Failed to record purchase' });
  }
};

exports.listPurchases = async (req, res) => {
  try {
    const { from, to, vendor_id, payment_type } = req.query;
    const purchases = await Purchase.findAll({ from, to, vendor_id, payment_type });
    res.json(purchases);
  } catch (err) {
    console.error('listPurchases error:', err);
    res.status(500).json({ message: 'Failed to fetch purchases' });
  }
};

exports.getPurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
    res.json(purchase);
  } catch (err) {
    console.error('getPurchase error:', err);
    res.status(500).json({ message: 'Failed to fetch purchase' });
  }
};

// Powers the Total Purchase Report page
exports.getTotalsSummary = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: 'from and to dates are required' });
    }
    const totals = await Purchase.getTotalsSummary({ from, to });
    res.json(totals);
  } catch (err) {
    console.error('getTotalsSummary error:', err);
    res.status(500).json({ message: 'Failed to fetch totals' });
  }
};
