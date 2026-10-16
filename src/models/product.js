const db = require('../config/database')

const Product = {
  async findAll() {
    // is_active = 1 tu: bidhaa zilizofutwa (soft delete) hazionekani Inventory/Sales,
    // lakini bado zipo kwa ajili ya historia (sale_items, reports, stock movements)
    const [rows] = await db.execute('SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC')
    return rows
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM products WHERE id = ?', [id])
    return rows[0]
  },

  // NB: wholesale_price imeongezwa - kama haijawekwa (undefined/null), tunaiacha NULL
  // (frontend inaweza kuiacha wazi kama product haina bei ya jumla)
  //
  // `pharmacy` (MPYA): object ya hiari yenye fields za pharmacy module - hardware
  // clients hawaipitishi kabisa (inabaki default null/false zote) - hakuna athari
  // kwa products za kawaida.
  async create(name, description, price, cost_price, stock, unit, low_stock_alert, category, shelf, wholesale_price, pharmacy = {}) {
    const {
      expiry_date = null, batch_number = null, requires_prescription = false,
      dosage = null, manufacturer = null, drug_category = null, isPharmacy = false, created_by = null
    } = pharmacy

    if (isPharmacy && Number(stock || 0) > 0 && (!String(batch_number || '').trim() || !expiry_date)) {
      throw new Error('Opening pharmacy stock requires a batch number and expiry date. Receive stock through Procurement or enter both batch fields.')
    }

    if (isPharmacy && Number(stock || 0) > 0) {
      const conn = await db.getConnection()
      try {
        await conn.beginTransaction()
        const [[expiry]] = await conn.execute('SELECT ? < CURDATE() AS expired', [expiry_date])
        if (expiry.expired) throw new Error('Expired medicine stock cannot be added as active inventory')
        const [result] = await conn.execute(
          `INSERT INTO products (name,description,price,wholesale_price,cost_price,stock,unit,low_stock_alert,category,shelf,
           expiry_date,batch_number,requires_prescription,dosage,manufacturer,drug_category)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [name, description, price, wholesale_price || null, cost_price || 0, stock, unit || 'PC', low_stock_alert || 5, category, shelf || null,
            expiry_date, String(batch_number).trim(), requires_prescription ? 1 : 0, dosage || null, manufacturer || null, drug_category || null]
        )
        const [batchResult] = await conn.execute(`INSERT INTO inventory_batches
          (product_id,batch_number,received_date,expiry_date,quantity_received,quantity_on_hand,unit_cost,status,created_by)
          VALUES (?,?,CURDATE(),?,?,?,?, 'active',?)`, [result.insertId, String(batch_number).trim(), expiry_date, stock, stock, cost_price || 0, created_by])
        await conn.execute(`INSERT INTO batch_stock_movements (batch_id,product_id,movement_type,quantity_change,quantity_before,quantity_after,reference_type,reference_id,reason,performed_by)
          VALUES (?,?,'opening',?,0,?,'opening_batch',?,'Initial stock entered with medicine',?)`, [batchResult.insertId, result.insertId, stock, stock, batchResult.insertId, created_by])
        await conn.execute(`INSERT INTO stock_movements (product_id,movement_type,quantity_change,stock_before,stock_after,reference_type,reference_id,reason,performed_by)
          VALUES (?,'purchase',?,0,?,'opening_batch',?,'Initial pharmacy stock entered with medicine',?)`, [result.insertId, stock, stock, batchResult.insertId, created_by])
        await conn.commit()
        return result.insertId
      } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    }

    const [result] = await db.execute(
      `INSERT INTO products
        (name, description, price, wholesale_price, cost_price, stock, unit, low_stock_alert, category, shelf,
         expiry_date, batch_number, requires_prescription, dosage, manufacturer, drug_category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, description, price, wholesale_price || null, cost_price || 0, stock, unit || 'PC', low_stock_alert || 5, category, shelf || null,
        expiry_date || null, batch_number || null, requires_prescription ? 1 : 0, dosage || null, manufacturer || null, drug_category || null
      ]
    )
    return result.insertId
  },

  async update(id, name, description, price, cost_price, stock, unit, low_stock_alert, category, shelf, wholesale_price, pharmacy = {}) {
    const {
      expiry_date = null, batch_number = null, requires_prescription = false,
      dosage = null, manufacturer = null, drug_category = null
    } = pharmacy

    const [result] = await db.execute(
      `UPDATE products SET
        name=?, description=?, price=?, wholesale_price=?, cost_price=?, stock=?, unit=?, low_stock_alert=?, category=?, shelf=?,
        expiry_date=?, batch_number=?, requires_prescription=?, dosage=?, manufacturer=?, drug_category=?
       WHERE id=?`,
      [
        name, description, price, wholesale_price || null, cost_price, stock, unit, low_stock_alert, category, shelf || null,
        expiry_date || null, batch_number || null, requires_prescription ? 1 : 0, dosage || null, manufacturer || null, drug_category || null,
        id
      ]
    )
    return result.affectedRows
  },

  // SOFT DELETE — hatufuti row. sale_items, stock_movements, PO/GRN na reports
  // zote zinarejea product hii; hard DELETE ilikuwa inakataliwa na foreign key
  // (au ingefuta stock_movements kwa CASCADE).
  async softDelete(id) {
    const [result] = await db.execute(
      'UPDATE products SET is_active = 0, deleted_at = NOW() WHERE id = ? AND is_active = 1',
      [id]
    )
    return result.affectedRows
  },

  async findLowStock() {
    const [rows] = await db.execute(
      'SELECT * FROM products WHERE is_active = 1 AND stock <= low_stock_alert ORDER BY stock ASC'
    )
    return rows
  },

  // MPYA (Pharmacy): products zenye expiry_date ndani ya siku fulani (default 30),
  // pamoja na zilizoshaisha muda wake (expiry_date < leo). Kwa Dashboard alert.
  async findExpiringSoon(days = 30) {
    const [rows] = await db.execute(
      `SELECT * FROM products
       WHERE is_active = 1
         AND expiry_date IS NOT NULL
         AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY expiry_date ASC`,
      [days]
    )
    return rows
  },

  async decreaseStock(id, quantity) {
    const [result] = await db.execute(
      'UPDATE products SET stock = stock - ? WHERE id = ?',
      [quantity, id]
    )
    return result.affectedRows
  }
}

module.exports = Product
