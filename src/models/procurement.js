const db = require('../config/database')
const StockMovement = require('./stockMovement')

// ── Purchase Orders ──────────────────────────────────────────────────────────
const PurchaseOrder = {
  // Tengeneza PO number kiotomatiki — mfano: PO-2025-0042
  async generatePONumber() {
    const year = new Date().getFullYear()
    const [rows] = await db.execute(
      "SELECT COUNT(*) as cnt FROM purchase_orders WHERE YEAR(created_at) = ?", [year]
    )
    const seq = (rows[0].cnt + 1).toString().padStart(4, '0')
    return `PO-${year}-${seq}`
  },

  async create(vendor_id, expected_date, notes, created_by) {
    const po_number = await PurchaseOrder.generatePONumber()
    const [result] = await db.execute(
      'INSERT INTO purchase_orders (po_number, vendor_id, status, expected_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [po_number, vendor_id || null, 'draft', expected_date || null, notes || null, created_by]
    )
    return { id: result.insertId, po_number }
  },

  async addItem(po_id, product_id, product_name, quantity_ordered, unit_cost) {
    const [result] = await db.execute(
      'INSERT INTO po_items (po_id, product_id, product_name, quantity_ordered, unit_cost) VALUES (?, ?, ?, ?, ?)',
      [po_id, product_id || null, product_name, quantity_ordered, unit_cost]
    )
    return result.insertId
  },

  async findAll() {
    const [rows] = await db.execute(
      `SELECT po.*, v.name as vendor_name, u.name as created_by_name
       FROM purchase_orders po
       LEFT JOIN vendors v ON po.vendor_id = v.id
       LEFT JOIN users u ON po.created_by = u.id
       ORDER BY po.created_at DESC`
    )
    return rows
  },

  async findById(id) {
    const [pos] = await db.execute(
      `SELECT po.*, v.name as vendor_name, u.name as created_by_name
       FROM purchase_orders po
       LEFT JOIN vendors v ON po.vendor_id = v.id
       LEFT JOIN users u ON po.created_by = u.id
       WHERE po.id = ?`, [id]
    )
    const [items] = await db.execute(
      `SELECT pi.*, p.name as current_product_name
       FROM po_items pi
       LEFT JOIN products p ON pi.product_id = p.id
       WHERE pi.po_id = ?`, [id]
    )
    return { po: pos[0], items }
  },

  async updateStatus(id, status) {
    const [result] = await db.execute(
      'UPDATE purchase_orders SET status=? WHERE id=?', [status, id]
    )
    return result.affectedRows
  }
}

// ── Goods Received Notes ─────────────────────────────────────────────────────
const GRN = {
  async generateGRNNumber() {
    const year = new Date().getFullYear()
    const [rows] = await db.execute(
      "SELECT COUNT(*) as cnt FROM goods_received WHERE YEAR(created_at) = ?", [year]
    )
    const seq = (rows[0].cnt + 1).toString().padStart(4, '0')
    return `GRN-${year}-${seq}`
  },

  // Pokea bidhaa: unda GRN, ongeza stock, sasisha cost_price ya product
  // kwa WEIGHTED AVERAGE (sio overwrite ya bei ya mwisho tu).
  //
  // MPYA: sasa inakubali vendor_id + payment_type ('cash' | 'credit') +
  // amount_paid. Hii ndiyo Cash/Credit Purchase — GRN "bila PO" ndiyo
  // tayari ilikuwa purchase ya moja kwa moja, sasa tu tunajua NANI (vendor)
  // na JINSI GANI (cash/credit) ililipwa, na tunasasisha vendor.balance
  // kama ni credit.
  async receive({ po_id, vendor_id, payment_type = 'cash', amount_paid, received_date, notes, items, received_by }) {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      const grn_number = await GRN.generateGRNNumber()

      // Kama GRN hii inahusiana na PO na hakuna vendor_id iliyotumwa moja
      // kwa moja, rithi vendor kutoka kwenye PO husika.
      let resolvedVendorId = vendor_id || null
      if (po_id && !resolvedVendorId) {
        const [poRows] = await conn.execute('SELECT vendor_id FROM purchase_orders WHERE id = ?', [po_id])
        resolvedVendorId = poRows[0]?.vendor_id || null
      }

      const total_amount = items.reduce(
        (sum, item) => sum + Number(item.quantity_received) * Number(item.unit_cost), 0
      )
      const paidAmount = payment_type === 'cash' ? total_amount : (Number(amount_paid) || 0)

      const [grnResult] = await conn.execute(
        `INSERT INTO goods_received
           (grn_number, po_id, vendor_id, payment_type, total_amount, amount_paid, received_date, notes, received_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [grn_number, po_id || null, resolvedVendorId, payment_type, total_amount, paidAmount, received_date, notes || null, received_by]
      )
      const grn_id = grnResult.insertId

      for (const item of items) {
        // Hifadhi GRN item
        await conn.execute(
          'INSERT INTO grn_items (grn_id, product_id, product_name, quantity_received, unit_cost) VALUES (?, ?, ?, ?, ?)',
          [grn_id, item.product_id || null, item.product_name, item.quantity_received, item.unit_cost]
        )

        if (item.product_id) {
          // ═══════════════════════════════════════════════════════════════
          // AVERAGE COST PRICE (haijabadilika)
          // ═══════════════════════════════════════════════════════════════
          const [prodRows] = await conn.execute(
            'SELECT stock, cost_price FROM products WHERE id = ? FOR UPDATE',
            [item.product_id]
          )
          if (prodRows.length === 0) {
            throw new Error(`Product ID ${item.product_id} haipo kwenye database`)
          }

          const stockBefore = Number(prodRows[0].stock)
          const costBefore = parseFloat(prodRows[0].cost_price) || 0
          const incomingQty = Number(item.quantity_received)
          const incomingCost = parseFloat(item.unit_cost)

          const totalQtyAfter = stockBefore + incomingQty
          const newAverageCost = totalQtyAfter > 0
            ? ((stockBefore * costBefore) + (incomingQty * incomingCost)) / totalQtyAfter
            : incomingCost

          await conn.execute(
            'UPDATE products SET cost_price = ? WHERE id = ?',
            [newAverageCost.toFixed(2), item.product_id]
          )

          await StockMovement.log({
            product_id: item.product_id,
            movement_type: 'purchase',
            quantity_change: incomingQty,
            reference_type: 'grn',
            reference_id: grn_id,
            reason: null,
            performed_by: received_by
          }, conn)

          await conn.execute(
            'UPDATE po_items SET quantity_received = quantity_received + ? WHERE po_id = ? AND product_id = ?',
            [item.quantity_received, po_id, item.product_id]
          )
        }
      }

      // Badilisha status ya PO kuwa 'received'
      if (po_id) {
        await conn.execute(
          "UPDATE purchase_orders SET status='received' WHERE id=?", [po_id]
        )
      }

      // MPYA: Credit purchase — ongeza balance ya vendor kwa kiasi
      // ambacho bado hakijalipwa. Row inalockwa kwanza kuzuia race
      // condition kama malipo mengine yanafanyika wakati mmoja.
      if (resolvedVendorId && payment_type === 'credit') {
        const balanceIncrease = total_amount - paidAmount
        await conn.execute('SELECT id FROM vendors WHERE id = ? FOR UPDATE', [resolvedVendorId])
        await conn.execute('UPDATE vendors SET balance = balance + ? WHERE id = ?', [balanceIncrease, resolvedVendorId])
      }

      await conn.commit()
      return { grn_id, grn_number }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async findAll() {
    const [rows] = await db.execute(
      `SELECT gr.*, po.po_number, v.name as vendor_name, u.name as received_by_name
       FROM goods_received gr
       LEFT JOIN purchase_orders po ON gr.po_id = po.id
       LEFT JOIN vendors v ON gr.vendor_id = v.id
       LEFT JOIN users u ON gr.received_by = u.id
       ORDER BY gr.created_at DESC`
    )
    return rows
  },

  async findById(id) {
    const [grns] = await db.execute(
      `SELECT gr.*, po.po_number, v.name as vendor_name, u.name as received_by_name
       FROM goods_received gr
       LEFT JOIN purchase_orders po ON gr.po_id = po.id
       LEFT JOIN vendors v ON gr.vendor_id = v.id
       LEFT JOIN users u ON gr.received_by = u.id
       WHERE gr.id = ?`, [id]
    )
    const [items] = await db.execute(
      'SELECT * FROM grn_items WHERE grn_id = ?', [id]
    )
    return { grn: grns[0], items }
  }
}

module.exports = { PurchaseOrder, GRN }
