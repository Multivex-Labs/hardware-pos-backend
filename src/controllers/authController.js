const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
require('dotenv').config()

const authController = {
  // Register user mpya
  async register(req, res) {
    try {
      const { name, email, password, role } = req.body

      const existingUser = await User.findByEmail(email)
      if (existingUser) {
        return res.status(400).json({ message: 'Email tayari inatumika' })
      }

      const userId = await User.create(name, email, password, role)

      res.status(201).json({ 
        message: 'User ameundwa successfully',
        userId 
      })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  // Login
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

      const token = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      )

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

  // Get current user
  async me(req, res) {
    try {
      const user = await User.findById(req.user.id)
      res.json(user)
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  }
}

module.exports = authController