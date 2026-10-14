// Adjust this import path if your MySQL pool is exported from a different
// location — per convention it should be `config/database.js`.
const pool = require('../config/database');

const Purchase = {
  // Generates PUR-2026-0001 style numbers, same pattern as PO-2025-0001
  async generatePurchaseNumber(conn) {
    const year = new Date().getFullYear();
    const [rows] = await conn.execute(
      `SELECT purchase_number FROM purchases
        WHERE purchase_number LIKE ?
        ORDER BY id DESC LIMIT 1`,
      [`PUR-${year}-%`]
    );

    let nextSeq = 1;
    if (rows.length) {
      const lastSeq = parseInt(rows[0].purchase_number.split('-')[2], 10);
      nextSeq = lastSeq + 1;
    }
    return `PUR-${year}-${String(nextSeq).padStart(4, '0')}`;
  },

  // Creates a Cash or Credit purchase with one or more product line items.
  // Stock is incremented and cost_price updated for every item, atomically.
  // If payment_type is 'credit', the vendor's payable balance is increased
  // by (total_amount - amount_paid).
  async createWithItems({ vendor_id, payment_type, amount_paid, notes, recorded_by, items }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const purchase_number = await this.generatePurchaseNumber(conn);

      const total_amount = items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.cost_per_unit),
        0
      );
      const paidAmount = payment_type === 'cash' ? total_amount : Number(amount_paid) || 0;

      const [purchaseResult] = await conn.execute(
        `INSERT INTO purchases
           (purchase_number, vendor_id, payment_type, total_amount, amount_paid, notes, recorded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [purchase_number, vendor_id, payment_type, total_amount, paidAmount, notes || null, recorded_by]
      );
      const purchaseId = purchaseResult.insertId;

      for (const item of items) {
        const subtotal = Number(item.quantity) * Number(item.cost_per_unit);

        await conn.execute(
          `INSERT INTO purchase_items
             (purchase_id, product_id, product_name, quantity, cost_per_unit, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [purchaseId, item.product_id, item.product_name, item.quantity, item.cost_per_unit, subtotal]
        );

        // Row-level lock before mutating stock — required per engineering
        // principle on atomic stock operations.
        await conn.execute(`SELECT id FROM products WHERE id = ? FOR UPDATE`, [item.product_id]);

        await conn.execute(
          `UPDATE products SET stock = stock + ?, cost_price = ? WHERE id = ?`,
          [item.quantity, item.cost_per_unit, item.product_id]
        );
      }

      if (payment_type === 'credit') {
        const balanceIncrease = total_amount - paidAmount;

        // Lock the vendor row before adjusting balance
        await conn.execute(`SELECT id FROM vendors WHERE id = ? FOR UPDATE`, [vendor_id]);

        await conn.execute(`UPDATE vendors SET balance = balance + ? WHERE id = ?`, [
          balanceIncrease,
          vendor_id,
        ]);
      }

      await conn.commit();
      return { id: purchaseId, purchase_number, total_amount, amount_paid: paidAmount };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async findAll({ from, to, vendor_id, payment_type } = {}) {
    let query = `
      SELECT p.*, v.name AS vendor_name
        FROM purchases p
        LEFT JOIN vendors v ON v.id = p.vendor_id
       WHERE 1 = 1
    `;
    const params = [];

    if (from) {
      query += ` AND p.created_at >= ?`;
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      query += ` AND p.created_at <= ?`;
      params.push(`${to} 23:59:59`);
    }
    if (vendor_id) {
      query += ` AND p.vendor_id = ?`;
      params.push(vendor_id);
    }
    if (payment_type) {
      query += ` AND p.payment_type = ?`;
      params.push(payment_type);
    }

    query += ` ORDER BY p.created_at DESC`;

    const [rows] = await pool.execute(query, params);
    return rows;
  },

  async findById(id) {
    const [[purchase]] = await pool.execute(
      `SELECT p.*, v.name AS vendor_name
         FROM purchases p
         LEFT JOIN vendors v ON v.id = p.vendor_id
        WHERE p.id = ?`,
      [id]
    );
    if (!purchase) return null;

    const [items] = await pool.execute(`SELECT * FROM purchase_items WHERE purchase_id = ?`, [id]);
    return { ...purchase, items };
  },

  // Powers the Total Purchase Report
  async getTotalsSummary({ from, to }) {
    const [[totals]] = await pool.execute(
      `SELECT
         COUNT(*) AS purchase_count,
         COALESCE(SUM(total_amount), 0) AS total_amount,
         COALESCE(SUM(CASE WHEN payment_type = 'cash' THEN total_amount ELSE 0 END), 0) AS cash_total,
         COALESCE(SUM(CASE WHEN payment_type = 'credit' THEN total_amount ELSE 0 END), 0) AS credit_total
       FROM purchases
       WHERE created_at >= ? AND created_at <= ?`,
      [`${from} 00:00:00`, `${to} 23:59:59`]
    );
    return totals;
  },
};

module.exports = Purchase;
