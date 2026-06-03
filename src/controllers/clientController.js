const Client = require('../models/client')

const clientController = {
  // Pata clients zote
  async getAll(req, res) {
    try {
      const clients = await Client.findAll()
      res.json(clients)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Pata client moja
  async getOne(req, res) {
    try {
      const client = await Client.findById(req.params.id)
      if (!client) {
        return res.status(404).json({ message: 'Client haikupatikana' })
      }
      res.json(client)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Tafuta client
  async search(req, res) {
    try {
      const { query } = req.query
      if (!query) {
        return res.status(400).json({ message: 'Weka neno la kutafuta' })
      }
      const clients = await Client.search(query)
      res.json(clients)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Unda client mpya
  async create(req, res) {
    try {
      const { name, phone, email, address, credit_limit } = req.body

      if (!name) {
        return res.status(400).json({ message: 'Jina la client ni lazima' })
      }

      const clientId = await Client.create(name, phone, email, address, credit_limit || 0)

      res.status(201).json({
        message: 'Client ameundwa successfully',
        clientId
      })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Edit client
  async update(req, res) {
    try {
      const { name, phone, email, address } = req.body
      const client = await Client.findById(req.params.id)

      if (!client) {
        return res.status(404).json({ message: 'Client haikupatikana' })
      }

      await Client.update(
        req.params.id,
        name || client.name,
        phone || client.phone,
        email || client.email,
        address || client.address
      )

      res.json({ message: 'Client imebadilishwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Futa client
  async delete(req, res) {
    try {
      const client = await Client.findById(req.params.id)
      if (!client) {
        return res.status(404).json({ message: 'Client haikupatikana' })
      }

      await Client.delete(req.params.id)
      res.json({ message: 'Client amefutwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Pata purchase history ya client
  async getPurchaseHistory(req, res) {
    try {
      const client = await Client.findById(req.params.id)
      if (!client) {
        return res.status(404).json({ message: 'Client haikupatikana' })
      }

      const history = await Client.getPurchaseHistory(req.params.id)
      res.json({ client, history })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Rekodi malipo
  async recordPayment(req, res) {
    try {
      const { amount, payment_method, reference, notes } = req.body
      const client_id = req.params.id

      if (!amount || isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ message: 'Weka kiasi sahihi cha malipo' })
      }

      const client = await Client.findById(client_id)
      if (!client) {
        return res.status(404).json({ message: 'Client haikupatikana' })
      }

      if (Number(amount) > Number(client.balance)) {
        return res.status(400).json({
          message: `Malipo (${amount}) yanazidi deni la client (${client.balance})`
        })
      }

      const payment_id = await Client.recordPayment({
        client_id,
        amount: Number(amount),
        payment_method,
        reference,
        notes,
        recorded_by: req.user?.id
      })

      res.status(201).json({
        message: 'Malipo yamerekodiwa successfully',
        payment_id
      })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Pata historia ya malipo
  async getPaymentHistory(req, res) {
    try {
      const client = await Client.findById(req.params.id)
      if (!client) {
        return res.status(404).json({ message: 'Client haikupatikana' })
      }

      const payments = await Client.getPaymentHistory(req.params.id)
      res.json({ client, payments })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Pata profile kamili na stats
  async getProfile(req, res) {
    try {
      const client = await Client.findByIdWithStats(req.params.id)
      if (!client) {
        return res.status(404).json({ message: 'Client haikupatikana' })
      }
      res.json(client)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Badilisha credit limit
  async updateCreditLimit(req, res) {
    try {
      const { credit_limit } = req.body

      if (credit_limit === undefined || isNaN(credit_limit) || Number(credit_limit) < 0) {
        return res.status(400).json({ message: 'Weka credit limit sahihi' })
      }

      const client = await Client.findById(req.params.id)
      if (!client) {
        return res.status(404).json({ message: 'Client haikupatikana' })
      }

      await Client.updateCreditLimit(req.params.id, Number(credit_limit))
      res.json({ message: 'Credit limit imebadilishwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }

}

module.exports = clientController