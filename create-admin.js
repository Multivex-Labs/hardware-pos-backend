// Add this to backend/src/controllers/saleController.js

const db = require('../config/database')

// Existing methods...

// ✅ NEW: Get single sale with items
exports.getById = async (req, res) => {
  try {
    const { id } = req.params
    
    // Get sale details
    const [sales] = await db.execute(`
      SELECT 
        s.id, s.total, s.discount, s.payment_method, s.created_at,
        c.name as client_name,
        u.name as cashier_name
      FROM sales s
      LEFT JOIN clients c ON s.client_id = c.id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `, [id])
    
    if (sales.length === 0) {
      return res.status(404).json({ error: 'Sale not found' })
    }
    
    // Get sale items
    const [items] = await db.execute(`
      SELECT 
        si.quantity, si.price,
        p.name as product_name, p.unit
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      WHERE si.sale_id = ?
    `, [id])
    
    res.json({
      ...sales[0],
      items: items.map(item => ({
        name: item.product_name,
        unit: item.unit,
        quantity: item.quantity,
        price: item.price
      }))
    })
  } catch (error) {
    console.error('Get sale error:', error)
    res.status(500).json({ error: error.message })
  }
}
