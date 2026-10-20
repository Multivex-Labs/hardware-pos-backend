const BusinessSettings = require('../models/businessSettings')

const BUSINESS_TYPES = ['general', 'hardware', 'pharmacy']

// req.tenant inawekwa na tenant middleware TU kwenye multi-tenant mode.
// Multi-tenant ON  -> business type inabadilishwa na admin panel ya Multivex (imefungwa hapa).
// Multi-tenant OFF -> POS ya kawaida / local install: hakuna admin panel, kwa hiyo admin wa duka anaiweka mwenyewe.
const isManagedByPlatform = (req) => Boolean(req.tenant)

const businessSettingsController = {
  // Login page inaita bila token; mtu aliyeingia anapata taarifa zote.
  async get(req, res) {
    try {
      const settings = await BusinessSettings.get()
      const locked = isManagedByPlatform(req)

      if (!settings) return res.json({ business_type_locked: locked })

      // Bila token: toa taarifa za umma tu (bila TIN wala bank details)
      if (!req.user) {
        const { business_name, logo, address, phone, motto, business_type } = settings
        return res.json({ business_name, logo, address, phone, motto, business_type, business_type_locked: locked })
      }

      res.json({ ...settings, business_type_locked: locked })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // ADMIN ONLY - kubadilisha taarifa za biashara
  async update(req, res) {
    try {
      const body = req.body || {}
      const hasType = Object.prototype.hasOwnProperty.call(body, 'business_type')

      if (hasType) {
        if (isManagedByPlatform(req)) {
          return res.status(400).json({ message: 'Business type is managed by Multivex Labs and cannot be changed here' })
        }
        if (req.user?.role !== 'admin') {
          return res.status(403).json({ message: 'Only the admin can change the business type' })
        }
        if (!BUSINESS_TYPES.includes(body.business_type)) {
          return res.status(400).json({ message: 'Business type is not valid' })
        }
      }

      const {
        business_name, logo, address, phone, motto,
        tin_number, bank_name, bank_account, bank_branch
      } = body

      if (!business_name) {
        return res.status(400).json({ message: 'Jina la biashara ni lazima' })
      }

      const current = await BusinessSettings.get()

      await BusinessSettings.update({
        business_name,
        logo: logo !== undefined ? logo : current.logo,
        address: address !== undefined ? address : current.address,
        phone: phone !== undefined ? phone : current.phone,
        motto: motto !== undefined ? motto : current.motto,
        tin_number: tin_number !== undefined ? tin_number : current.tin_number,
        bank_name: bank_name !== undefined ? bank_name : current.bank_name,
        bank_account: bank_account !== undefined ? bank_account : current.bank_account,
        bank_branch: bank_branch !== undefined ? bank_branch : current.bank_branch,
        business_type: hasType ? body.business_type : (current.business_type || 'general')
      })

      res.json({ message: 'Business settings zimebadilishwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = businessSettingsController
