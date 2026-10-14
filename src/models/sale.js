const db = require('../config/database')
const StockMovement = require('./stockMovement')
const ClientDeposit = require('./clientDeposit')
const BusinessError = require('./businessError')
const AuditLog = require('./auditLog')

const EPS = 0.00005
const round2 = (n) => Math.round(Number(n) * 100) / 100
const round4 = (n) => Math.round(Number(n) * 10000) / 10000
const CASH_TYPE_METHODS = ['cash', 'mobile_money', 'bank_transfer']

const Sale = {
  // Unda sale mpya (cash, credit, au deposit)
  // walkin_name: jina la mteja asiyesajiliwa - hiari
  // amount_received/change_given: kwa cash sales pekee - kiasi mteja alicholipa na chenji aliyopewa
  async create(client_id, user_id, total, discount, payment_method, sale_type = 'cash', walkin_name = null, amount_received = null, change_given = null) {
    const [result] = await db.execute(
      'INSERT INTO sales (client_id, user_id, total, discount, payment_method, status, notes, walkin_name, amount_received, change_given) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [client_id, user_id, total, discount, payment_method, 'completed', sale_type, walkin_name, amount_received, change_given]
    )
    return result.insertId
  },

  // Ongeza items kwenye sale (na cost_price ya wakati huo - snapshot kwa profit)
  // price_type: 'retail' | 'wholesale' | 'custom' - inahifadhi ni bei gani ilitumika (kwa reports sahihi)
  // unit_id/unit_name/conversion_factor: MPYA - Unit Conversion. Snapshot ya unit
  // iliyotumika wakati wa sale hii (mfano "Box", factor=100) - hii haibadiliki
  // hata kama unit hiyo itafutwa/kubadilishwa baadaye kwenye Inventory.
  async addItems(sale_id, items) {
    for (const item of items) {
      await db.execute(
        `INSERT INTO sale_items
          (sale_id, product_id, quantity, price, price_type, cost_price, unit_id, unit_name, conversion_factor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sale_id, item.product_id, item.quantity, item.price, item.price_type || 'retail', item.cost_price || 0,
          item.unit_id || null, item.unit_name || null, item.conversion_factor || 1
        ]
      )
    }
  },

  // Ongeza deni kwa client (credit sale)
  async addClientDebt(client_id, amount, conn) {
    const connection = conn || db
    await connection.execute(
      'UPDATE clients SET balance = balance + ? WHERE id = ?',
      [amount, client_id]
    )
  },

  /**
   * createAtomic() — sale ZOTE (cash / credit / deposit) zinapita hapa.
   * Kila kitu kinatokea ndani ya TRANSACTION MOJA:
   *   sale row -> sale_items -> stock (FOR UPDATE) -> deni au amana (+ ledger)
   * Kikikatika popote, kila kitu kina-rollback — hakuna tena sale nusu-nusu.
   *
   * mode: 'cash' | 'credit' | 'deposit'
   * items: tayari zimepitia prepareItems() kwenye controller (price, cost_price, unit...)
   */
  async createAtomic({ mode, client_id = null, user_id, total, discount = 0, payment_method = 'cash',
    walkin_name = null, amount_received = null, change_given = null, items }) {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      // Credit/Deposit: funga row ya client NA uhakiki ndani ya transaction (sio kabla yake)
      let clientRow = null
      if (mode === 'credit' || mode === 'deposit') {
        const [rows] = await conn.execute('SELECT * FROM clients WHERE id = ? FOR UPDATE', [client_id])
        clientRow = rows[0]
        if (!clientRow) throw new BusinessError('Client haikupatikana', 404)

        if (mode === 'credit') {
          const available = Number(clientRow.credit_limit) - Number(clientRow.balance)
          if (total > available) {
            throw new BusinessError(
              `Credit haitoshi! Unahitaji TZS ${total.toLocaleString()} lakini available credit ni TZS ${available.toLocaleString()} tu`,
              400, { available_credit: available, required: total }
            )
          }
        } else if (total > Number(clientRow.deposit)) {
          throw new BusinessError(
            `Amana haitoshi! Unahitaji TZS ${total.toLocaleString()} lakini amana ni TZS ${Number(clientRow.deposit).toLocaleString()} tu`,
            400, { deposit: clientRow.deposit, required: total }
          )
        }
      }

      const methodForDb = mode === 'cash' ? payment_method : mode // 'credit' | 'deposit'

      const [saleResult] = await conn.execute(
        `INSERT INTO sales
          (client_id, user_id, total, discount, payment_method, status, notes, walkin_name, amount_received, change_given)
         VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
        [client_id || null, user_id, total, discount || 0, methodForDb, mode, walkin_name, amount_received, change_given]
      )
      const saleId = saleResult.insertId

      for (const item of items) {
        await conn.execute(
          `INSERT INTO sale_items
            (sale_id, product_id, quantity, price, price_type, cost_price, unit_id, unit_name, conversion_factor)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [saleId, item.product_id, item.quantity, item.price, item.price_type || 'retail', item.cost_price || 0,
            item.unit_id || null, item.unit_name || null, item.conversion_factor || 1]
        )
      }

      // Stock: quantity_change iko kwenye BASE UNITS (quantity × conversion_factor).
      // StockMovement.log(…, conn) inafunga row ya product (FOR UPDATE) na inakataa stock negative.
      for (const item of items) {
        try {
          await StockMovement.log({
            product_id: item.product_id,
            movement_type: 'sale',
            quantity_change: -(Number(item.quantity) * Number(item.conversion_factor || 1)),
            reference_type: 'sale',
            reference_id: saleId,
            reason: null,
            performed_by: user_id
          }, conn)
        } catch (err) {
          if (String(err.message).includes('Stock haiwezi kuwa negative')) {
            throw new BusinessError(`Stock haitoshi kwa ${item.product_name || 'bidhaa ' + item.product_id}`)
          }
          throw err
        }
      }

      const result = { saleId }

      if (mode === 'credit') {
        await conn.execute('UPDATE clients SET balance = balance + ? WHERE id = ?', [total, client_id])
        result.new_balance = Number(clientRow.balance) + total
      } else if (mode === 'deposit') {
        const dep = await ClientDeposit.apply(conn, {
          client_id,
          type: 'deposit_used',
          amount: -total,
          sale_id: saleId,
          notes: `Sale #${saleId}`,
          recorded_by: user_id
        })
        result.remaining_deposit = dep.balance_after
      }

      await conn.commit()
      return result
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  // Weka amana ya client — sasa inaandika kwenye ledger (client_deposit_transactions),
  // sio kwenye table ya payments tena.
  async addDeposit(client_id, amount, payment_method, reference, recorded_by) {
    const r = await ClientDeposit.addDeposit({ client_id, amount, payment_method, reference, recorded_by })
    return r
  },

  // Void/Cancel Sale - HAIFUTI sale (soft-cancel). Inarudisha stock na deni/amana
  // kama sale hii haikuwahi kutokea. Sale bado inabaki History na alama voided=true.
  async voidSale(id, user_id, reason) {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      const [saleRows] = await conn.execute('SELECT * FROM sales WHERE id = ? FOR UPDATE', [id])
      const sale = saleRows[0]
      if (!sale) throw new Error('Sale haikupatikana')
      if (sale.voided) throw new Error('Sale hii tayari ime-voidiwa awali')

      const [items] = await conn.execute('SELECT * FROM sale_items WHERE sale_id = ?', [id])

      // StockMovement.log() inachukua nafasi ya "UPDATE products SET stock = stock + ?"
      // ya awali — stock reversal NA movement log (movement_type='void_reversal')
      // vinafanyika pamoja, ndani ya TRANSACTION HII HII ya void.
      //
      // ⚠️ MUHIMU (Unit Conversion fix): item.quantity ni idadi ILIYOUZWA kwenye
      // UNIT husika (mfano "2" Box), SIO base units. Stock ilipunguzwa wakati wa
      // sale kwa (quantity × conversion_factor) - hivyo lazima turudishe kwa
      // kiwango kile kile (× conversion_factor), sio quantity peke yake -
      // vinginevyo tunarudisha kidogo sana kwa bidhaa zenye alternate units.
      for (const item of items) {
        const baseQuantity = Number(item.quantity) * Number(item.conversion_factor || 1)
        await StockMovement.log({
          product_id: item.product_id,
          movement_type: 'void_reversal',
          quantity_change: baseQuantity,
          reference_type: 'void',
          reference_id: id,
          reason: reason || null,
          performed_by: user_id
        }, conn)
      }

      // Rudisha deni (credit) au amana (deposit) kutegemea aina ya sale (notes = sale_type)
      if (sale.notes === 'credit' && sale.client_id) {
        await conn.execute('UPDATE clients SET balance = GREATEST(balance - ?, 0) WHERE id = ?', [sale.total, sale.client_id])
      } else if (sale.notes === 'deposit' && sale.client_id) {
        await ClientDeposit.apply(conn, {
          client_id: sale.client_id,
          type: 'void_restore',
          amount: Number(sale.total),
          sale_id: id,
          notes: `Void of sale #${id}`,
          recorded_by: user_id
        })
      }

      await conn.execute(
        'UPDATE sales SET voided = TRUE, voided_by = ?, voided_at = NOW(), void_reason = ? WHERE id = ?',
        [user_id, reason || null, id]
      )

      await conn.commit()
      return { sale, items }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  /**
   * editAtomic() — Edit Receipt. Kila kitu ndani ya TRANSACTION MOJA:
   *   lock sale -> hakiki -> stock delta (ledger) -> deni/amana -> update lines -> update sale -> audit log
   * Kikikatika popote, kila kitu kina-rollback — hakuna edit nusu-nusu.
   *
   * lines: [{ sale_item_id, quantity, unit_id, price_type, custom_price }]
   *        line isiyotumwa = imeondolewa kwenye risiti.
   * resolveLine(origRow, lineInput): async function kutoka controller — inaamua
   *        unit/bei server-side (mteja wa API haaminiwi kuamua bei ya mwisho).
   */
  async editAtomic({ sale_id, user_id, reason, walkin_name, payment_method, discount, lines, resolveLine }) {
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      // 1. Funga sale na hakiki hali yake
      const [saleRows] = await conn.execute('SELECT * FROM sales WHERE id = ? FOR UPDATE', [sale_id])
      const sale = saleRows[0]
      if (!sale) throw new BusinessError('Receipt not found', 404)
      if (sale.voided) throw new BusinessError('This receipt has been voided and cannot be edited')

      const [retRows] = await conn.execute('SELECT COUNT(*) AS c FROM returns WHERE sale_id = ?', [sale_id])
      if (Number(retRows[0].c) > 0) {
        throw new BusinessError('This receipt already has returns processed against it and cannot be edited')
      }

      // 2. Lines za sasa (zimefungwa). Majina ya bidhaa yanasomwa bila lock ili kuepuka deadlock na sales zingine.
      const [origItems] = await conn.execute('SELECT * FROM sale_items WHERE sale_id = ? FOR UPDATE', [sale_id])
      const productIds = [...new Set(origItems.map(r => Number(r.product_id)))]
      const nameById = new Map()
      const unitById = new Map()
      if (productIds.length > 0) {
        const [prodRows] = await conn.execute(
          `SELECT id, name, unit FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`,
          productIds
        )
        for (const p of prodRows) { nameById.set(Number(p.id), p.name); unitById.set(Number(p.id), p.unit) }
      }

      // 3. Hakiki lines zilizotumwa
      const origById = new Map(origItems.map(r => [Number(r.id), r]))
      const seen = new Set()
      for (const l of lines) {
        const sid = Number(l.sale_item_id)
        if (!origById.has(sid)) throw new BusinessError('One of the items does not belong to this receipt')
        if (seen.has(sid)) throw new BusinessError('The same item was sent twice')
        seen.add(sid)
      }
      if (seen.size === 0) throw new BusinessError('A receipt must keep at least one item. To cancel it, use Void.')

      // 4. Amua unit/bei ya kila line (server-side)
      const resolved = []
      for (const l of lines) {
        const orig = origById.get(Number(l.sale_item_id))
        orig.product_name = nameById.get(Number(orig.product_id)) || `product ${orig.product_id}`
        const r = await resolveLine(orig, l)
        resolved.push({ orig, ...r })
      }

      // 5. Totals
      const subtotal = resolved.reduce((s, r) => s + r.price * r.quantity, 0)
      const hasDiscount = discount !== undefined && discount !== null && discount !== ''
      const disc = hasDiscount ? Number(discount) : Number(sale.discount || 0)
      if (!Number.isFinite(disc) || disc < 0 || disc > subtotal) throw new BusinessError('Invalid discount')
      const newTotal = round2(subtotal - disc)
      const oldTotal = round2(sale.total)
      const delta = round2(newTotal - oldTotal)

      // 6. Method / walk-in name (hesabu tu, bado hakuna kinachoandikwa)
      const mode = sale.notes // 'cash' | 'credit' | 'deposit'
      let newMethod = sale.payment_method
      let newReceived = sale.amount_received
      let newChange = sale.change_given
      if (mode === 'cash') {
        newMethod = payment_method && CASH_TYPE_METHODS.includes(payment_method) ? payment_method : sale.payment_method
        if (newMethod === 'cash') {
          if (sale.payment_method === 'cash' && sale.amount_received != null) {
            const received = Number(sale.amount_received)
            if (newTotal > received) {
              throw new BusinessError(
                `The new total (TZS ${newTotal.toLocaleString()}) is more than the cash received (TZS ${received.toLocaleString()}). Void this receipt and create a new sale instead.`
              )
            }
            newReceived = received
            newChange = round2(received - newTotal)
          } else if (sale.payment_method !== 'cash') {
            // Ilikuwa mobile money/bank, sasa inakuwa cash: tunachukulia ililipwa kamili, bila chenji
            newReceived = newTotal
            newChange = 0
          }
        } else {
          newReceived = null
          newChange = null
        }
      }

      let newWalkin = sale.walkin_name || null
      if (!sale.client_id && walkin_name !== undefined) {
        const w = String(walkin_name || '').trim().slice(0, 150)
        newWalkin = w || null
      }

      // 7. Hakuna mabadiliko? Usiandike chochote
      const removedCount = origItems.length - resolved.length
      const lineChanged = resolved.some(r =>
        Number(r.orig.quantity) !== r.quantity ||
        round2(r.orig.price) !== round2(r.price) ||
        (r.orig.price_type || 'retail') !== r.price_type ||
        (r.orig.unit_id ? Number(r.orig.unit_id) : null) !== r.unit_id
      )
      const changed = removedCount > 0 || lineChanged ||
        round2(sale.discount || 0) !== round2(disc) ||
        newMethod !== sale.payment_method ||
        (newWalkin || null) !== (sale.walkin_name || null)
      if (!changed) throw new BusinessError('No changes to save')

      // 8. STOCK: tofauti kwa kila product (base units = quantity × conversion_factor).
      //    Products zinafungwa kwa mpangilio wa id ili kuepuka deadlock.
      const oldBase = new Map()
      const newBase = new Map()
      for (const r of origItems) {
        const pid = Number(r.product_id)
        oldBase.set(pid, (oldBase.get(pid) || 0) + Number(r.quantity) * Number(r.conversion_factor || 1))
      }
      for (const r of resolved) {
        const pid = Number(r.orig.product_id)
        newBase.set(pid, (newBase.get(pid) || 0) + r.quantity * r.conversion_factor)
      }
      const allPids = [...new Set([...oldBase.keys(), ...newBase.keys()])].sort((a, b) => a - b)
      for (const pid of allPids) {
        const d = round4((newBase.get(pid) || 0) - (oldBase.get(pid) || 0)) // positive = zimeuzwa zaidi
        if (Math.abs(d) < EPS) continue
        try {
          await StockMovement.log({
            product_id: pid,
            movement_type: 'sale_edit',
            quantity_change: -d,
            reference_type: 'sale',
            reference_id: sale_id,
            reason: `Receipt #${sale_id} edited: ${reason}`.slice(0, 240),
            performed_by: user_id
          }, conn)
        } catch (err) {
          if (String(err.message).includes('Stock haiwezi kuwa negative')) {
            throw new BusinessError(`Not enough stock for ${nameById.get(pid) || 'product ' + pid} to increase this receipt`)
          }
          throw err
        }
      }

      // 9. PESA: deni / amana kutegemea aina ya sale
      const result = { sale_id, old_total: oldTotal, new_total: newTotal, difference: delta, items_removed: removedCount }

      if (mode === 'credit') {
        const [cRows] = await conn.execute('SELECT * FROM clients WHERE id = ? FOR UPDATE', [sale.client_id])
        const client = cRows[0]
        if (!client) throw new BusinessError('Client not found', 404)
        if (delta > 0) {
          const available = round2(Number(client.credit_limit) - Number(client.balance))
          if (delta > available) {
            throw new BusinessError(
              `Credit limit exceeded. The new total needs TZS ${delta.toLocaleString()} more credit but only TZS ${available.toLocaleString()} is available`,
              400, { available_credit: available, required: delta }
            )
          }
        }
        if (delta !== 0) {
          await conn.execute('UPDATE clients SET balance = GREATEST(balance + ?, 0) WHERE id = ?', [delta, sale.client_id])
        }
        result.new_balance = Math.max(round2(Number(client.balance) + delta), 0)
      } else if (mode === 'deposit') {
        if (delta !== 0) {
          const dep = await ClientDeposit.apply(conn, {
            client_id: sale.client_id,
            type: delta > 0 ? 'deposit_used' : 'adjustment',
            amount: -delta,
            sale_id,
            notes: `Receipt #${sale_id} edited`,
            recorded_by: user_id
          })
          result.remaining_deposit = dep.balance_after
        }
      }

      // 10. Andika lines: sasisha zilizobaki, futa zilizoondolewa (snapshot kamili ipo kwenye audit log)
      for (const r of resolved) {
        await conn.execute(
          `UPDATE sale_items
             SET quantity = ?, price = ?, price_type = ?, unit_id = ?, unit_name = ?, conversion_factor = ?
           WHERE id = ? AND sale_id = ?`,
          [r.quantity, r.price, r.price_type, r.unit_id || null, r.unit_name || null, r.conversion_factor || 1, r.orig.id, sale_id]
        )
      }
      for (const o of origItems) {
        if (!seen.has(Number(o.id))) {
          await conn.execute('DELETE FROM sale_items WHERE id = ? AND sale_id = ?', [o.id, sale_id])
        }
      }

      await conn.execute(
        `UPDATE sales
           SET total = ?, discount = ?, payment_method = ?, walkin_name = ?, amount_received = ?, change_given = ?,
               edited_at = NOW(), edited_by = ?, edit_count = edit_count + 1
         WHERE id = ?`,
        [newTotal, disc, newMethod, newWalkin, newReceived ?? null, newChange ?? null, user_id, sale_id]
      )

      // 11. Audit log (ndani ya transaction hii hii — ikikosa, edit nzima inarudi nyuma)
      const before = {
        total: oldTotal,
        discount: round2(sale.discount || 0),
        payment_method: sale.payment_method,
        walkin_name: sale.walkin_name || null,
        items: origItems.map(o => ({
          product: nameById.get(Number(o.product_id)) || `product ${o.product_id}`,
          quantity: Number(o.quantity),
          unit: o.unit_name || unitById.get(Number(o.product_id)) || null,
          price: Number(o.price),
          price_type: o.price_type || 'retail'
        }))
      }
      const after = {
        total: newTotal,
        discount: round2(disc),
        payment_method: newMethod,
        walkin_name: newWalkin,
        items: resolved.map(r => ({
          product: nameById.get(Number(r.orig.product_id)) || `product ${r.orig.product_id}`,
          quantity: r.quantity,
          unit: r.unit_name || null,
          price: r.price,
          price_type: r.price_type
        }))
      }
      await AuditLog.create(user_id, 'EDIT_RECEIPT', 'sales', sale_id, reason, before, after, conn)

      await conn.commit()
      return result
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  // Pata sales zote
  async findAll() {
    const [rows] = await db.execute(
      `SELECT s.id, s.client_id, s.walkin_name, s.total, s.discount, s.payment_method, s.notes as sale_type, s.created_at,
       s.voided, s.void_reason, s.edited_at, s.edit_count,
       c.name as client_name, u.name as cashier_name
       FROM sales s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       ORDER BY s.created_at DESC`
    )
    return rows
  },

  // Pata sale moja na items zake (pamoja na cost_price kwa profit per sale)
  // NB: sale_item_id na product_id vimeongezwa - vinahitajika na Returns feature
  // NB2 (Unit Conversion): "unit" sasa ni COALESCE(si.unit_name, p.unit) - kama
  // sale hii iliuzwa kwa "Box", risiti/history itaonyesha "Box" sio base unit
  // ya sasa ya product. Sales za zamani (kabla ya feature hii) zina unit_name=NULL
  // kwa hiyo zinaanguka kwenye p.unit kama ilivyokuwa awali - hakuna kinachovunjika.
  async findById(id) {
    const [sale] = await db.execute(
      `SELECT s.id, s.client_id, s.walkin_name, s.total, s.discount, s.payment_method, s.notes as sale_type, s.created_at,
       s.voided, s.void_reason, s.edited_at, s.edit_count, s.amount_received, s.change_given,
       c.name as client_name, u.name as cashier_name
       FROM sales s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = ?`,
      [id]
    )

    const [items] = await db.execute(
      `SELECT si.id as sale_item_id, si.product_id, si.quantity, si.price, si.price_type, si.cost_price,
       si.unit_id, si.conversion_factor, COALESCE(si.unit_name, p.unit) as unit,
       p.name as product_name
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = ?`,
      [id]
    )

    return { sale: sale[0], items }
  },

  // Pata sales za leo
  async findToday() {
    const [rows] = await db.execute(
      `SELECT s.id, s.client_id, s.walkin_name, s.total, s.discount, s.payment_method, s.notes as sale_type, s.created_at,
       s.voided, s.void_reason, s.edited_at, s.edit_count,
       c.name as client_name, u.name as cashier_name
       FROM sales s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE DATE(s.created_at) = CURDATE()
       ORDER BY s.created_at DESC`
    )
    return rows
  },

  // Pata report ya mwezi
  async findByMonth(year, month) {
    const [rows] = await db.execute(
      `SELECT s.id, s.client_id, s.walkin_name, s.total, s.discount, s.payment_method, s.notes as sale_type, s.created_at,
       s.voided, s.void_reason, s.edited_at, s.edit_count,
       c.name as client_name, u.name as cashier_name
       FROM sales s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE YEAR(s.created_at) = ? AND MONTH(s.created_at) = ?
       ORDER BY s.created_at DESC`,
      [year, month]
    )
    return rows
  }
}

module.exports = Sale
