const db = require('../config/database')
const BusinessError = require('./businessError')

const METHODS = ['cash', 'mobile_money', 'bank_transfer']
const round2 = (n) => Math.round(Number(n) * 100) / 100

const ClientDeposit = {
  METHODS,

  /**
   * apply() — kazi kuu. Inabadilisha clients.deposit NA kuandika row ya ledger
   * kwa pamoja. LAZIMA iitwe ndani ya transaction (pitisha `conn`).
   *
   * amount ni SIGNED: positive = amana inaongezeka, negative = inapungua.
   * Row ya client inafungwa (FOR UPDATE) kwa hiyo cashiers wawili hawawezi
   * kutumia amana ile ile kwa wakati mmoja.
   */
  async apply(conn, { client_id, type, amount, payment_method = null, reference = null, sale_id = null, notes = null, recorded_by = null }) {
    const [rows] = await conn.execute('SELECT deposit FROM clients WHERE id = ? FOR UPDATE', [client_id])
    if (rows.length === 0) throw new BusinessError('Client haikupatikana', 404)

    const before = round2(rows[0].deposit || 0)
    const after = round2(before + Number(amount))

    if (after < 0) {
      throw new BusinessError(
        `Amana haitoshi! Unahitaji TZS ${Math.abs(Number(amount)).toLocaleString()} lakini amana ni TZS ${before.toLocaleString()} tu`,
        400,
        { deposit: before, required: Math.abs(Number(amount)) }
      )
    }

    await conn.execute('UPDATE clients SET deposit = ? WHERE id = ?', [after, client_id])

    const [result] = await conn.execute(
      `INSERT INTO client_deposit_transactions
        (client_id, type, amount, balance_after, payment_method, reference, sale_id, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [client_id, type, round2(amount), after, payment_method, reference || null, sale_id, notes, recorded_by]
    )

    return { id: result.insertId, balance_before: before, balance_after: after }
  },

  // Mteja ameleta pesa: weka amana. Transaction yake yenyewe.
  async addDeposit({ client_id, amount, payment_method, reference, notes, recorded_by }) {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      const result = await this.apply(conn, {
        client_id,
        type: 'deposit_in',
        amount: Math.abs(Number(amount)),
        payment_method: METHODS.includes(payment_method) ? payment_method : 'cash',
        reference,
        notes: notes || null,
        recorded_by
      })
      await conn.commit()
      return result
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  // Statement ya client mmoja (mpya juu)
  async findByClient(client_id, limit = 200) {
    const safeLimit = Number(limit) || 200
    const [rows] = await db.execute(
      `SELECT t.*, u.name AS recorded_by_name
       FROM client_deposit_transactions t
       LEFT JOIN users u ON u.id = t.recorded_by
       WHERE t.client_id = ?
       ORDER BY t.id DESC
       LIMIT ${safeLimit}`,
      [client_id]
    )
    return rows
  },

  // Ledger ya clients wote (kwa Sales > Deposits)
  async findRecent(limit = 200) {
    const safeLimit = Number(limit) || 200
    const [rows] = await db.execute(
      `SELECT t.*, c.name AS client_name, u.name AS recorded_by_name
       FROM client_deposit_transactions t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN users u ON u.id = t.recorded_by
       ORDER BY t.id DESC
       LIMIT ${safeLimit}`
    )
    return rows
  }
}

module.exports = ClientDeposit
