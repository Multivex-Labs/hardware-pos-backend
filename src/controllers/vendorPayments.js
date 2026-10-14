const VendorPayment = require('../models/vendorPayment');

exports.createVendorPayment = async (req, res) => {
  try {
    const { vendor_id, amount, payment_method, notes } = req.body;

    if (!vendor_id || !amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'vendor_id and a positive amount are required' });
    }

    const result = await VendorPayment.create({
      vendor_id,
      amount,
      payment_method,
      notes,
      recorded_by: req.user.id,
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('createVendorPayment error:', err);
    res.status(500).json({ message: err.message || 'Failed to record vendor payment' });
  }
};

exports.listVendorPayments = async (req, res) => {
  try {
    const payments = await VendorPayment.findByVendor(req.params.vendorId);
    res.json(payments);
  } catch (err) {
    console.error('listVendorPayments error:', err);
    res.status(500).json({ message: 'Failed to fetch vendor payments' });
  }
};
