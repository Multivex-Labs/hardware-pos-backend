const bcrypt = require('bcryptjs')
const User = require('../models/User')
const { signToken } = require('../utils/tenantJwt')
require('dotenv').config()

// Roles zinazokubalika kwenye system.
const ALLOWED_ROLES = ['admin', 'manager', 'cashier']

const authController = {
  // Register user mpya — ADMIN ONLY (route imelindwa pia)
  async register(req, res) {
    try {
      const { name, email, password, role } = req.body

      if (!name || !email || !password) {
        return res.status(400).json({ message: 'Jaza jina, email na password' })
      }

      const safeRole = role && ALLOWED_ROLES.includes(role) ? role : 'cashier'

      const existingUser = await User.findByEmail(email)
      if (existingUser) {
        return res.status(400).json({ message: 'Email tayari inatumika' })
      }

      const userId = await User.create(name, email, password, safeRole)

      res.status(201).json({
        message: 'User ameundwa successfully',
        userId
      })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async login(req, res) {
    try {
      const { email, password } = req.body

      const user = await User.findByEmail(email)
      if (!user) {
        return res.status(400).json({ message: 'Email au password si sahihi' })
      }

      const isMatch = await bcrypt.compare(password, user.password)
      if (!isMatch) {
        return res.status(400).json({ message: 'Email au password si sahihi' })
      }

      // Secret ya duka hili (multi-tenant) au JWT_SECRET ya .env (mode ya zamani)
      const token = signToken({ id: user.id, role: user.role }, req.tenant || null, '8h')

      res.json({
        message: 'Umeingia successfully',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async me(req, res) {
    try {
      const user = await User.findById(req.user.id)
      res.json(user)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async getAllUsers(req, res) {
    try {
      const users = await User.findAll()
      res.json(users)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async deleteUser(req, res) {
    try {
      const { id } = req.params

      if (Number(id) === req.user.id) {
        return res.status(400).json({ message: 'Hauwezi kufuta akaunti yako mwenyewe' })
      }

      const userToDelete = await User.findById(id)
      if (!userToDelete) {
        return res.status(404).json({ message: 'User haikupatikana' })
      }

      if (userToDelete.role === 'admin') {
        const adminCount = await User.countAdmins()
        if (adminCount <= 1) {
          return res.status(400).json({ message: 'Hauwezi kufuta admin wa mwisho aliyebaki' })
        }
      }

      await User.delete(id)
      res.json({ message: 'User amefutwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = authController
