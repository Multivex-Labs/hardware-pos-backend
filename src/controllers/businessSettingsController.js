const BusinessSettings = require('../models/businessSettings')

const businessSettingsController = {
  // PUBLIC - inahitajika kwenye login page bila token
  async get(req, res) {
    try {
      const settings = await BusinessSettings.get()
      res.json(settings)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // ADMIN ONLY - kubadilisha taarifa zote
  async update(req, res) {
    try {
      const {
        business_name, logo, address, phone, motto,
        tin_number, bank_name, bank_account, bank_branch,
        business_type // MPYA - 'hardware' | 'pharmacy' | 'general'
      } = req.body

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
        // business_type column ni NOT NULL kwenye DB - lazima tuwe na thamani
        // kila wakati, kwa hiyo tuna-fallback mara mbili: request -> current -> 'general'
        business_type: business_type !== undefined ? business_type : (current.business_type || 'general')
      })

      res.json({ message: 'Business settings zimebadilishwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = businessSettingsController
