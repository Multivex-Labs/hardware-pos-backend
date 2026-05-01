const Client = require('../models/Client')

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
      const { name, phone, email, address } = req.body

      if (!name) {
        return res.status(400).json({ message: 'Jina la client ni lazima' })
      }

      const clientId = await Client.create(name, phone, email, address)

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
  }
}

module.exports = clientController