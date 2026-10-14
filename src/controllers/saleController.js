const Sale = require('../models/sale')
const Product = require('../models/product')
const Client = require('../models/client')
const Return = require('../models/return')
const AuditLog = require('../models/auditLog')
const StockMovement = require('../models/stockMovement')
const ProductUnit = require('../models/productUnit') // MPYA - Unit Conversion
const ClientDeposit = require('../models/clientDeposit')
const BusinessError = require('../models/businessError')

// Inaamua bei sahihi ya item kutegemea price_type aliyochagua cashier kwenye cart:
// 'retail' (default) -> product.price | 'wholesale' -> product.wholesale_price | 'custom' -> bei aliyoiweka mwenyewe
// NB: bei ya mwisho inayotumika INAAMULIWA HAPA server-side, sio kuaminiwa moja kwa moja kutoka frontend
// NB2: "product" hapa inaweza kuwa product halisi (base unit) AU toleo lililobadilishwa
// kuwa na bei za unit mbadala (angalia resolveUnit()) - resolvePrice haijui tofauti,
// inasoma tu .price na .wholesale_price ya object iliyopewa.
function resolvePrice(product, item) {
  let priceType = item.price_type || 'retail'
  let unitPrice

  if (priceType === 'wholesale') {
    if (product.wholesale_price === null || product.wholesale_price === undefined) {
      throw new Error(`${product.name} haina bei ya jumla (wholesale) iliyowekwa kwenye Inventory`)
    }
    unitPrice = parseFloat(product.wholesale_price)
  } else if (priceType === 'custom') {
    const custom = parseFloat(item.custom_price)
    if (isNaN(custom) || custom < 0) {
      throw new Error(`Weka bei sahihi (custom) kwa ${product.name}`)
    }
    unitPrice = custom
  } else {
    priceType = 'retail'
    unitPrice = parseFloat(product.price)
  }

  return { unitPrice, priceType }
}

// MPYA - Unit Conversion: inaamua ni unit gani inatumika kwa item hii.
// Kama item.unit_id haijawekwa -> tunatumia base unit ya product (conversion_factor=1).
// Kama imewekwa -> tunatafuta kwenye product_units, tunahakiki inamilikiwa na
// product hii hii (usalama - mtu asiweze kutuma unit_id ya product nyingine),
// kisha tunarudisha "unitProduct" - nakala ya product yenye price/wholesale_price
// zilizobadilishwa kuwa za unit hiyo, ili resolvePrice() iendelee kufanya kazi
// bila kubadilishwa hata kidogo.
async function resolveUnit(product, item) {
  if (!item.unit_id) {
    return { conversionFactor: 1, unitName: product.unit || 'PC', unitProduct: product }
  }

  const unit = await ProductUnit.findById(item.unit_id)
  if (!unit || unit.product_id !== product.id) {
    throw new Error(`Unit uliyochagua si sahihi kwa ${product.name}`)
  }

  return {
    conversionFactor: parseFloat(unit.conversion_factor),
    unitName: unit.unit_name,
    unitProduct: { ...product, price: unit.selling_price, wholesale_price: unit.wholesale_price }
  }
}

// ── Edit Receipt: inaamua unit/bei ya line MOJA ya risiti iliyopo (server-side) ──
// Sheria muhimu: line ambayo unit na price_type havijabadilika (na si 'custom') INABAKI
// na bei na conversion_factor ya wakati wa mauzo — hatuipi bei ya leo kimya kimya, wala
// hatubadilishi stock bila sababu kama conversion_factor ya unit imebadilika baadaye.
async function resolveEditLine(orig, input) {
  const name = orig.product_name || `product ${orig.product_id}`

  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) throw new BusinessError(`Invalid quantity for ${name}`)

  const product = await Product.findById(orig.product_id)
  if (!product) throw new BusinessError(`${name} no longer exists`, 404)

  const origUnitId = orig.unit_id ? Number(orig.unit_id) : null
  const unitId = input.unit_id === undefined
    ? origUnitId
    : (input.unit_id === null || input.unit_id === '' ? null : Number(input.unit_id))
  const unitChanged = unitId !== origUnitId

  let unitInfo
  try { unitInfo = await resolveUnit(product, { unit_id: unitId }) } catch (err) { throw new BusinessError(err.message) }

  const origType = orig.price_type || 'retail'
  const priceType = ['retail', 'wholesale', 'custom'].includes(input.price_type) ? input.price_type : origType

  let price
  if (priceType === 'custom') {
    const hasInput = input.custom_price !== undefined && input.custom_price !== null && input.custom_price !== ''
    const c = parseFloat(hasInput ? input.custom_price : (origType === 'custom' ? orig.price : NaN))
    if (!Number.isFinite(c) || c < 0) throw new BusinessError(`Enter a valid custom price for ${name}`)
    price = c
  } else if (!unitChanged && priceType === origType) {
    price = Number(orig.price)
  } else {
    const w = unitInfo.unitProduct.wholesale_price
    if (priceType === 'wholesale' && (w === null || w === undefined)) {
      throw new BusinessError(`${name} has no wholesale price for this unit`)
    }
    price = resolvePrice(unitInfo.unitProduct, { price_type: priceType }).unitPrice
  }

  return {
    quantity,
    price,
    price_type: priceType,
    unit_id: unitId,
    unit_name: unitChanged ? unitInfo.unitName : (orig.unit_name || unitInfo.unitName),
    conversion_factor: unitChanged ? unitInfo.conversionFactor : Number(orig.conversion_factor || 1)
  }
}

const SALE_METHODS = ['cash', 'mobile_money', 'bank_transfer']

// Inahakiki items, inaamua bei/unit server-side, na inarudisha jumla. Inatupa BusinessError
// (4xx) kwa kosa lolote la mteja — hakuna kinachoandikwa kwenye DB hapa (read-only).
async function prepareItems(items, discount) {
  let total = 0
  const prepared = []

  for (const raw of items) {
    const item = { ...raw }
    const product = await Product.findById(item.product_id)
    if (!product) throw new BusinessError(`Product ${item.product_id} haikupatikana`, 404)
    if (product.is_active === 0) throw new BusinessError(`${product.name} imeondolewa kwenye Inventory`)

    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
      throw new BusinessError(`Idadi ya ${product.name} si sahihi`)
    }

    let unitInfo
    try { unitInfo = await resolveUnit(product, item) } catch (err) { throw new BusinessError(err.message) }

    // Uhakiki wa awali kwa ujumbe mzuri; uhakiki wa mwisho (na lock) uko kwenye StockMovement.log
    const requiredBaseQty = Number(item.quantity) * unitInfo.conversionFactor
    if (product.stock < requiredBaseQty) throw new BusinessError(`Stock haitoshi kwa ${product.name}`)

    let resolved
    try { resolved = resolvePrice(unitInfo.unitProduct, item) } catch (err) { throw new BusinessError(err.message) }

    total += resolved.unitPrice * Number(item.quantity)
    item.price = resolved.unitPrice
    item.price_type = resolved.priceType
    item.cost_price = product.cost_price
    item.unit_id = item.unit_id || null
    item.unit_name = unitInfo.unitName
    item.conversion_factor = unitInfo.conversionFactor
    item.product_name = product.name
    prepared.push(item)
  }

  const disc = Number(discount) || 0
  if (disc < 0 || disc > total) throw new BusinessError('Discount si sahihi')

  return { items: prepared, total, discount: disc, finalTotal: total - disc }
}

function sendError(res, error) {
  if (error && error.isBusinessError) {
    return res.status(error.status).json({ message: error.message, ...error.extra })
  }
  console.error(error)
  return res.status(500).json({ message: 'Server error', error: error.message })
}

// Kama migration ya Edit Receipt haijaendeshwa, mtumiaji apate ujumbe unaoeleweka (si "Server error")
function sendEditError(res, error) {
  const dbNotReady = error && !error.isBusinessError && (
    error.errno === 1054 || error.errno === 1265 ||
    error.code === 'ER_BAD_FIELD_ERROR' || error.code === 'WARN_DATA_TRUNCATED'
  )
  if (dbNotReady) {
    console.error(error)
    return res.status(500).json({
      message: 'The database has not been updated for Edit Receipt yet. Run edit_receipt_migration.sql, then try again.',
      error: error.message
    })
  }
  return sendError(res, error)
}

const saleController = {

  // CASH sale (cash / mobile_money / bank_transfer) — atomic
  async create(req, res) {
    try {
      const { client_id, walkin_name, items, discount, payment_method, amount_received } = req.body
      const user_id = req.user.id

      if (!items || items.length === 0) {
        return res.status(400).json({ message: 'Ongeza bidhaa angalau moja' })
      }

      const method = payment_method || 'cash'
      if (!SALE_METHODS.includes(method)) {
        return res.status(400).json({ message: 'Njia ya malipo si sahihi' })
      }

      const prepared = await prepareItems(items, discount)
      const finalTotal = prepared.finalTotal

      // Amount Received + Change - inatumika kwa Cash pekee (mobile money/bank transfer ni exact amount)
      let amountReceivedValue = null
      let changeGiven = null
      if (method === 'cash') {
        amountReceivedValue = parseFloat(amount_received)
        if (isNaN(amountReceivedValue) || amountReceivedValue < finalTotal) {
          return res.status(400).json({ message: `Amount received is less than the total. Total due: TZS ${finalTotal.toLocaleString()}` })
        }
        changeGiven = amountReceivedValue - finalTotal
      }

      const { saleId } = await Sale.createAtomic({
        mode: 'cash',
        client_id: client_id || null,
        user_id,
        total: finalTotal,
        discount: prepared.discount,
        payment_method: method,
        walkin_name: walkin_name || null,
        amount_received: amountReceivedValue,
        change_given: changeGiven,
        items: prepared.items
      })

      res.status(201).json({ message: 'Sale imefanyika!', saleId, total: finalTotal, amount_received: amountReceivedValue, change: changeGiven })
    } catch (error) {
      sendError(res, error)
    }
  },

  // CREDIT sale (mkopo) — atomic, credit check ndani ya transaction (client row imefungwa)
  async createCreditSale(req, res) {
    try {
      const { client_id, items, discount } = req.body
      const user_id = req.user.id

      if (!client_id) return res.status(400).json({ message: 'Chagua client kwa credit sale' })
      if (!items || items.length === 0) return res.status(400).json({ message: 'Ongeza bidhaa angalau moja' })

      const prepared = await prepareItems(items, discount)

      const { saleId, new_balance } = await Sale.createAtomic({
        mode: 'credit',
        client_id,
        user_id,
        total: prepared.finalTotal,
        discount: prepared.discount,
        items: prepared.items
      })

      res.status(201).json({
        message: `Credit sale imefanyika! Deni jipya: TZS ${new_balance.toLocaleString()}`,
        saleId,
        total: prepared.finalTotal,
        new_balance
      })
    } catch (error) {
      sendError(res, error)
    }
  },

  // DEPOSIT sale (kulipia kwa amana) — atomic + ledger row (deposit_used)
  async createDepositSale(req, res) {
    try {
      const { client_id, items, discount } = req.body
      const user_id = req.user.id

      if (!client_id) return res.status(400).json({ message: 'Chagua client kwa deposit sale' })
      if (!items || items.length === 0) return res.status(400).json({ message: 'Ongeza bidhaa angalau moja' })

      const prepared = await prepareItems(items, discount)

      const { saleId, remaining_deposit } = await Sale.createAtomic({
        mode: 'deposit',
        client_id,
        user_id,
        total: prepared.finalTotal,
        discount: prepared.discount,
        items: prepared.items
      })

      res.status(201).json({
        message: `Deposit sale imefanyika! Amana iliyobaki: TZS ${remaining_deposit.toLocaleString()}`,
        saleId,
        total: prepared.finalTotal,
        remaining_deposit
      })
    } catch (error) {
      sendError(res, error)
    }
  },

  // Mteja ameleta pesa: weka amana. Pesa HAIKAI idle — inaingia kwenye ledger kama
  // "deposit_in", inahesabiwa kama cash on hand, lakini SIO sales/revenue mpaka itumike.
  async addDeposit(req, res) {
    try {
      const { client_id, amount, payment_method, reference, notes } = req.body
      const recorded_by = req.user.id

      const value = Number(amount)
      if (!client_id || !Number.isFinite(value) || value <= 0) {
        return res.status(400).json({ message: 'Weka client na kiasi sahihi' })
      }
      if (payment_method && !ClientDeposit.METHODS.includes(payment_method)) {
        return res.status(400).json({ message: 'Njia ya malipo si sahihi' })
      }

      const client = await Client.findById(client_id)
      if (!client) return res.status(404).json({ message: 'Client haikupatikana' })

      const result = await ClientDeposit.addDeposit({
        client_id, amount: value, payment_method: payment_method || 'cash', reference, notes, recorded_by
      })

      res.status(201).json({
        message: `Amana ya TZS ${value.toLocaleString()} imewekwa!`,
        client_name: client.name,
        new_deposit: result.balance_after
      })
    } catch (error) {
      sendError(res, error)
    }
  },

  // Ledger ya amana ya clients wote (Sales > Deposits)
  async getDepositHistory(req, res) {
    try {
      const rows = await ClientDeposit.findRecent(req.query.limit)
      res.json(rows)
    } catch (error) {
      sendError(res, error)
    }
  },

  async getAll(req, res) {
    try {
      const sales = await Sale.findAll()
      res.json(sales)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getOne(req, res) {
    try {
      const result = await Sale.findById(req.params.id)
      if (!result.sale) return res.status(404).json({ message: 'Sale haikupatikana' })
      res.json(result)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // MPYA: Sale + items zake + "inayoweza kurudishwa" per item (kwa Returns page)
  async getReturnable(req, res) {
    try {
      const result = await Sale.findById(req.params.id)
      if (!result.sale) return res.status(404).json({ message: 'Risiti haikupatikana' })

      const returnedMap = await Return.getReturnedQtyMap(req.params.id)

      const items = result.items.map(item => {
        const already_returned = returnedMap[item.sale_item_id] || 0
        return {
          ...item,
          already_returned,
          max_returnable: item.quantity - already_returned
        }
      })

      res.json({ sale: result.sale, items })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Void/Cancel Sale - Manager/Admin pekee (imezuiliwa kwenye route na requireRole middleware)
  async voidSale(req, res) {
    try {
      const { reason } = req.body
      const saleId = req.params.id

      if (!reason || !reason.trim()) {
        return res.status(400).json({ message: 'Please provide a reason for voiding this sale' })
      }

      // Kama sale hii tayari ina returns, tunazuia void ya moja kwa moja - inahitaji ushughulikiaji maalum
      const existingReturns = await Return.findBySale(saleId)
      if (existingReturns.length > 0) {
        return res.status(400).json({ message: 'This sale already has returns processed against it and cannot be voided automatically. Please contact support.' })
      }

      const result = await Sale.voidSale(saleId, req.user.id, reason)

      await AuditLog.create(
        req.user.id, 'VOID_SALE', 'sales', saleId, reason,
        { voided: false, total: result.sale.total, sale_type: result.sale.notes, client_id: result.sale.client_id },
        { voided: true, void_reason: reason }
      )

      res.json({ message: `✓ Sale #${saleId} has been voided. Stock and any credit/deposit effects have been reversed.` })
    } catch (error) {
      res.status(400).json({ message: error.message || 'Failed to void sale' })
    }
  },

  // Edit Receipt - Manager/Admin pekee (imezuiliwa kwenye route na requireRole middleware).
  // Kazi yote nzito iko kwenye Sale.editAtomic (transaction moja).
  async editReceipt(req, res) {
    try {
      const saleId = Number(req.params.id)
      const { reason, items, discount, payment_method, walkin_name } = req.body

      if (!Number.isInteger(saleId) || saleId <= 0) return res.status(400).json({ message: 'Invalid receipt number' })
      if (!reason || !String(reason).trim()) return res.status(400).json({ message: 'Please provide a reason for editing this receipt' })
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'A receipt must keep at least one item. To cancel it, use Void.' })
      }
      if (payment_method && !SALE_METHODS.includes(payment_method)) return res.status(400).json({ message: 'Invalid payment method' })

      const result = await Sale.editAtomic({
        sale_id: saleId,
        user_id: req.user.id,
        reason: String(reason).trim().slice(0, 500),
        walkin_name,
        payment_method,
        discount,
        lines: items,
        resolveLine: resolveEditLine
      })

      res.json({ message: `Receipt #${saleId} updated. New total: TZS ${result.new_total.toLocaleString()}`, ...result })
    } catch (error) {
      sendEditError(res, error)
    }
  },

  async getToday(req, res) {
    try {
      const sales = await Sale.findToday()
      const total = sales.filter(s => !s.voided).reduce((sum, sale) => sum + parseFloat(sale.total), 0)
      res.json({ sales, total_today: total.toFixed(2) })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getByMonth(req, res) {
    try {
      const { year, month } = req.params
      const sales = await Sale.findByMonth(year, month)
      const total = sales.filter(s => !s.voided).reduce((sum, sale) => sum + parseFloat(sale.total), 0)
      res.json({ sales, total_month: total.toFixed(2) })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = saleController
