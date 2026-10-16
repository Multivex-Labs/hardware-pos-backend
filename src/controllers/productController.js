const Product = require('../models/product')
const ProductUnit = require('../models/productUnit')
const Pharmacy = require('../models/pharmacy')
const BusinessSettings = require('../models/businessSettings')
const AuditLog = require('../models/auditLog')

const productController = {
  async getAll(req, res) {
    try {
      const products = await Product.findAll()
      const settings = await BusinessSettings.get()
      res.json(settings?.business_type === 'pharmacy' ? await Pharmacy.addEligibleStock(products) : products)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getOne(req, res) {
    try {
      const product = await Product.findById(req.params.id)
      if (!product) return res.status(404).json({ message: 'Product haikupatikana' })
      res.json(product)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async create(req, res) {
    try {
      const settings = await BusinessSettings.get()
      const isPharmacy = settings?.business_type === 'pharmacy'
      const {
        name, description, price, wholesale_price, cost_price, stock, unit, low_stock_alert, category, shelf,
        expiry_date, batch_number, requires_prescription, dosage, manufacturer, drug_category
      } = req.body

      if (!name || !price) {
        return res.status(400).json({ message: 'Jina na bei ya kuuza ni lazima' })
      }

      const productId = await Product.create(
        name, description, price, cost_price || 0,
        stock || 0, unit || 'PC', low_stock_alert || 5, category, shelf,
        wholesale_price || null,
        {
          expiry_date: expiry_date || null,
          batch_number: batch_number || null,
          requires_prescription: !!requires_prescription,
          dosage: dosage || null,
          manufacturer: manufacturer || null,
          drug_category: drug_category || null,
          isPharmacy,
          created_by: req.user.id
        }
      )
      res.status(201).json({ message: 'Product imeundwa successfully', productId })
    } catch (error) {
      res.status(400).json({ message: error.message })
    }
  },

  async update(req, res) {
    try {
      const {
        name, description, price, wholesale_price, cost_price, stock, unit, low_stock_alert, category, shelf,
        expiry_date, batch_number, requires_prescription, dosage, manufacturer, drug_category
      } = req.body
      const product = await Product.findById(req.params.id)
      if (!product) return res.status(404).json({ message: 'Product haikupatikana' })
      const settings = await BusinessSettings.get()
      const isPharmacy = settings?.business_type === 'pharmacy'
      if (isPharmacy && stock !== undefined && Number(stock) !== Number(product.stock)) {
        return res.status(400).json({ message: 'Use batch management or Procurement to change pharmacy stock so the batch ledger stays accurate' })
      }

      await Product.update(
        req.params.id,
        name ?? product.name,
        description ?? product.description,
        price ?? product.price,
        cost_price ?? product.cost_price,
        isPharmacy ? product.stock : (stock ?? product.stock),
        unit ?? product.unit,
        low_stock_alert ?? product.low_stock_alert,
        category ?? product.category,
        shelf !== undefined ? shelf : product.shelf,
        wholesale_price !== undefined ? wholesale_price : product.wholesale_price,
        {
          expiry_date: isPharmacy ? product.expiry_date : (expiry_date !== undefined ? expiry_date : product.expiry_date),
          batch_number: isPharmacy ? product.batch_number : (batch_number !== undefined ? batch_number : product.batch_number),
          requires_prescription: requires_prescription !== undefined ? !!requires_prescription : !!product.requires_prescription,
          dosage: dosage !== undefined ? dosage : product.dosage,
          manufacturer: manufacturer !== undefined ? manufacturer : product.manufacturer,
          drug_category: drug_category !== undefined ? drug_category : product.drug_category
        }
      )
      res.json({ message: 'Product imebadilishwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // SOFT DELETE: bidhaa inaondolewa Inventory/Sales, lakini historia (sales, reports,
  // stock movements, PO/GRN) inabaki kamili.
  async delete(req, res) {
    try {
      const product = await Product.findById(req.params.id)
      if (!product || product.is_active === 0) return res.status(404).json({ message: 'Product haikupatikana' })

      await Product.softDelete(req.params.id)

      // Audit log ni "best effort" — isizuie delete kama itafeli
      try {
        await AuditLog.create(
          req.user.id, 'DELETE_PRODUCT', 'products', product.id, null,
          { name: product.name, stock: product.stock, price: product.price, is_active: 1 },
          { is_active: 0 }
        )
      } catch (e) { console.error('Audit log (DELETE_PRODUCT) failed:', e.message) }

      res.json({ message: `${product.name} imeondolewa kwenye Inventory`, had_stock: product.stock })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getLowStock(req, res) {
    try {
      const products = await Product.findLowStock()
      res.json(products)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // MPYA (Pharmacy): GET /products/expiring-soon?days=30
  async getExpiringSoon(req, res) {
    try {
      const days = req.query.days ? Number(req.query.days) : 30
      const settings = await BusinessSettings.get()
      if (settings?.business_type === 'pharmacy') {
        const { data } = await Pharmacy.listBatches({ status: 'expiry', limit: 200 })
        return res.json(data.filter(batch => {
          const expiry = new Date(`${String(batch.expiry_date).slice(0, 10)}T00:00:00`)
          const today = new Date(); today.setHours(0, 0, 0, 0)
          return (expiry.getTime() - today.getTime()) / 86400000 <= days
        }).map(batch => ({ ...batch, name: batch.product_name, stock: batch.quantity_on_hand })))
      }
      const products = await Product.findExpiringSoon(days)
      res.json(products)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // ── Unit Conversion / Item Packages ───────────────────────────────────────

  async getAllUnits(req, res) {
    try {
      const units = await ProductUnit.findAll()
      res.json(units)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getUnits(req, res) {
    try {
      const units = await ProductUnit.findByProduct(req.params.id)
      res.json(units)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async createUnit(req, res) {
    try {
      const { unit_name, conversion_factor, selling_price, wholesale_price } = req.body
      const product = await Product.findById(req.params.id)
      if (!product) return res.status(404).json({ message: 'Product haikupatikana' })

      if (!unit_name || !conversion_factor || Number(conversion_factor) <= 0) {
        return res.status(400).json({ message: 'Jina la unit na conversion factor (zaidi ya 0) ni lazima' })
      }
      if (!selling_price || Number(selling_price) <= 0) {
        return res.status(400).json({ message: 'Bei ya kuuza ya unit hii ni lazima' })
      }

      const id = await ProductUnit.create(
        req.params.id, unit_name.trim(), Number(conversion_factor),
        Number(selling_price), wholesale_price ? Number(wholesale_price) : null
      )
      res.status(201).json({ message: `Unit "${unit_name}" imeongezwa kwa ${product.name}`, id })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async updateUnit(req, res) {
    try {
      const { unit_name, conversion_factor, selling_price, wholesale_price } = req.body
      const unit = await ProductUnit.findById(req.params.unitId)
      if (!unit || unit.product_id !== Number(req.params.id)) {
        return res.status(404).json({ message: 'Unit haikupatikana' })
      }
      if (!unit_name || !conversion_factor || Number(conversion_factor) <= 0 || !selling_price) {
        return res.status(400).json({ message: 'Jina, conversion factor, na bei ya kuuza ni lazima' })
      }

      await ProductUnit.update(
        req.params.unitId, unit_name.trim(), Number(conversion_factor),
        Number(selling_price), wholesale_price ? Number(wholesale_price) : null
      )
      res.json({ message: 'Unit imesasishwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async deleteUnit(req, res) {
    try {
      const unit = await ProductUnit.findById(req.params.unitId)
      if (!unit || unit.product_id !== Number(req.params.id)) {
        return res.status(404).json({ message: 'Unit haikupatikana' })
      }
      await ProductUnit.delete(req.params.unitId)
      res.json({ message: 'Unit imefutwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = productController
