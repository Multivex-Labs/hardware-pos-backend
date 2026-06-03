const db = require('../config/database')

const Client = {
  // Pata clients zote
  async findAll() {
    const [rows] = await db.execute(
      'SELECT * FROM clients ORDER BY name ASC'
    )
    return rows
  },

  // Pata client moja kwa id
  async findById(id) {
    const [rows] = await db.execute(
      'SELECT * FROM clients WHERE id = ?',
      [id]
    )
    return rows[0]
  },

  // Tafuta client kwa jina au simu
  async search(query) {
    const [rows] = await db.execute(
      'SELECT * FROM clients WHERE name LIKE ? OR phone LIKE ?',
      [`%${query}%`, `%${query}%`]
    )
    return rows
  },

  // Unda client mpya
  async create(name, phone, email, address, credit_limit = 0) {
    const [result] = await db.execute(
      'INSERT INTO clients (name, phone, email, address, credit_limit, balance, status) VALUES (?, ?, ?, ?, ?, 0, "active")',
      [name, phone, email, address, credit_limit]
    )
    return result.insertId
  },

  // Edit client
  async update(id, name, phone, email, address) {
    const [result] = await db.execute(
      'UPDATE clients SET name=?, phone=?, email=?, address=? WHERE id=?',
      [name, phone, email, address, id]
    )
    return result.affectedRows
  },

  // Futa client
  async delete(id) {
    const [result] = await db.execute(
      'DELETE FROM clients WHERE id = ?',
      [id]
    )
    return result.affectedRows
  },

  // Pata history ya manunuzi ya client
  async getPurchaseHistory(id) {
    const [rows] = await db.execute(
      `SELECT s.id, s.total, s.discount, s.payment_method, s.created_at,
       COUNT(si.id) as items_count
       FROM sales s
       LEFT JOIN sale_items si ON s.id = si.sale_id
       WHERE s.client_id = ?
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [id]
    )
    return rows
  }

  // Rekodi malipo ya client (inafanya mambo 2 kwa wakati mmoja)
  async recordPayment({ client_id, amount, payment_method, reference, notes, recorded_by }) {
    const conn = await db.getConnection()
    // ☝️ getConnection = chukua "njia moja" ya kuzungumza na DB
    //    Tunahitaji hii kwa sababu tutafanya operations 2 kwa pamoja

    try {
      await conn.beginTransaction()
      // ☝️ Sema DB: "Subiri niambie COMMIT kabla ya kuhifadhi kweli"

      // Operation 1: Ingiza record ya payment kwenye table ya payments
      const [result] = await conn.execute(`
        INSERT INTO payments (client_id, amount, payment_method, reference, notes, recorded_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [client_id, amount, payment_method || 'cash', reference || null, notes || null, recorded_by || null])

      // Operation 2: Punguza balance ya client
      await conn.execute(`
        UPDATE clients
        SET balance = GREATEST(balance - ?, 0)
        WHERE id = ?
      `, [amount, client_id])
      // ☝️ GREATEST(balance - amount, 0) = balance haiwezi kuwa chini ya 0

      await conn.commit()
      // ☝️ Sasa hifadhi kweli. Kama Operation 1 au 2 imeshindwa, rollback inafuta yote

      return result.insertId

    } catch (err) {
      await conn.rollback()
      // ☝️ Kuna tatizo — futa kila kitu kilichofanywa. Salama!
      throw err
    } finally {
      conn.release()
      // ☝️ Daima rudisha connection. Hata kama kuna error
    }
  },

  // Pata historia ya malipo ya client
  async getPaymentHistory(id) {
    const [rows] = await db.execute(`
      SELECT 
        p.id,
        p.amount,
        p.payment_method,
        p.reference,
        p.notes,
        p.created_at,
        u.name AS recorded_by_name
      FROM payments p
      LEFT JOIN users u ON u.id = p.recorded_by
      WHERE p.client_id = ?
      ORDER BY p.created_at DESC
    `, [id])
    // ☝️ LEFT JOIN users = tunapata jina la mtu aliyerekodi malipo

    return rows
  },

  // Pata client na stats zake zote (kwa profile page)
  async findByIdWithStats(id) {
    const [rows] = await db.execute(`
      SELECT 
        c.id,
        c.name,
        c.phone,
        c.email,
        c.address,
        c.credit_limit,
        c.balance,
        c.status,
        c.created_at,
        (c.credit_limit - c.balance)   AS available_credit,
        COUNT(DISTINCT s.id)            AS total_sales,
        COALESCE(SUM(s.total), 0)       AS total_purchased,
        COALESCE(SUM(p.amount), 0)      AS total_paid
      FROM clients c
      LEFT JOIN sales s    ON s.client_id = c.id
      LEFT JOIN payments p ON p.client_id = c.id
      WHERE c.id = ?
      GROUP BY c.id
    `, [id])

    return rows[0] || null
  },

  // Weka au badilisha credit limit ya client
  async updateCreditLimit(id, credit_limit) {
    const [result] = await db.execute(
      'UPDATE clients SET credit_limit = ? WHERE id = ?',
      [credit_limit, id]
    )
    return result.affectedRows > 0
  }

}
module.exports = Client