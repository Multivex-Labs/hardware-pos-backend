const bcrypt = require('bcryptjs')
const User = require('../models/User')
const { signToken } = require('../utils/tenantJwt')
const { isValidPermissions, validateRoleName } = require('../utils/permissions')
require('dotenv').config()

const authController = {
  // Register user mpya — ADMIN ONLY (route imelindwa pia)
  async register(req, res) {
    try {
      const { name, email, password, role } = req.body

      if (!name || !email || !password) {
        return res.status(400).json({ message: 'Jaza jina, email na password' })
      }
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return res.status(400).json({ message: 'Password lazima iwe na herufi 8 hadi 128' })
      }

      const safeRole = role || 'cashier'
      if (typeof safeRole !== 'string' || safeRole === 'admin' || !(await User.roleExists(safeRole))) {
        return res.status(400).json({ message: 'Role haipo au haiwezi kupewa user mpya' })
      }

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
          role: user.role,
          permissions: user.permissions,
          must_change_password: Boolean(user.must_change_password)
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

  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body
      if (typeof currentPassword !== 'string' || !currentPassword) {
        return res.status(400).json({ message: 'Weka password yako ya sasa' })
      }
      if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
        return res.status(400).json({ message: 'Password mpya lazima iwe na herufi 8 hadi 128' })
      }

      const currentHash = await User.findPasswordById(req.user.id)
      if (!currentHash || !(await bcrypt.compare(currentPassword, currentHash))) {
        return res.status(400).json({ message: 'Password ya sasa si sahihi' })
      }
      if (await bcrypt.compare(newPassword, currentHash)) {
        return res.status(400).json({ message: 'Password mpya lazima iwe tofauti na ya sasa' })
      }

      const passwordHash = await bcrypt.hash(newPassword, 10)
      await User.updatePassword(req.user.id, passwordHash)
      res.json({ message: 'Password imebadilishwa successfully' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async resetUserPassword(req, res) {
    try {
      const { id } = req.params
      const { temporaryPassword } = req.body
      if (Number(id) === req.user.id) {
        return res.status(400).json({ message: 'Tumia Change password kubadilisha password yako mwenyewe' })
      }
      if (typeof temporaryPassword !== 'string' || temporaryPassword.length < 8 || temporaryPassword.length > 128) {
        return res.status(400).json({ message: 'Temporary password lazima iwe na herufi 8 hadi 128' })
      }
      const user = await User.findById(id)
      if (!user) return res.status(404).json({ message: 'User haikupatikana' })

      const passwordHash = await bcrypt.hash(temporaryPassword, 10)
      await User.updatePassword(id, passwordHash, true)
      res.json({ message: 'Temporary password imewekwa. User atalazimika kuibadilisha akiingia.' })
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

  async getRoles(req, res) {
    try {
      res.json(await User.findRoles())
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async createRole(req, res) {
    try {
      const name = validateRoleName(req.body.name)
      if (!name) return res.status(400).json({ message: 'Role name must be 2–40 characters and not a reserved role' })
      if (!isValidPermissions(req.body.permissions)) {
        return res.status(400).json({ message: 'Permissions ulizotuma si sahihi' })
      }
      if (await User.roleExists(name)) {
        return res.status(409).json({ message: 'Role name tayari inatumika' })
      }

      await User.createRole(name, req.body.permissions)
      res.status(201).json({ message: 'Role imeundwa', name })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async updateRole(req, res) {
    try {
      const role = await User.findRole(req.params.name)
      if (!role) return res.status(404).json({ message: 'Role haikupatikana' })
      if (role.name === 'admin') {
        return res.status(400).json({ message: 'Admin role ina full access na haiwezi kubadilishwa' })
      }
      if (!isValidPermissions(req.body.permissions)) {
        return res.status(400).json({ message: 'Permissions ulizotuma si sahihi' })
      }

      await User.updateRole(role.name, req.body.permissions)
      res.json({ message: 'Permissions za role zimehifadhiwa' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async removeRole(req, res) {
    try {
      const role = await User.findRole(req.params.name)
      if (!role) return res.status(404).json({ message: 'Role haikupatikana' })
      if (role.system) {
        return res.status(400).json({ message: 'Built-in role haiwezi kufutwa' })
      }
      const removed = await User.deleteRole(role.name)
      if (!removed) {
        return res.status(409).json({ message: 'Ondoa role hii kwa users wote kwanza' })
      }
      res.json({ message: 'Role imefutwa' })
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message })
    }
  },

  async updateUserRole(req, res) {
    try {
      const { id } = req.params
      const { role } = req.body
      if (Number(id) === req.user.id) {
        return res.status(400).json({ message: 'Huwezi kubadilisha role ya akaunti yako mwenyewe' })
      }
      if (!role || role === 'admin' || !(await User.roleExists(role))) {
        return res.status(400).json({ message: 'Role haipo au haiwezi kupewa user' })
      }
      const targetUser = await User.findById(id)
      if (!targetUser) return res.status(404).json({ message: 'User haikupatikana' })
      if (targetUser.role === 'admin') {
        return res.status(400).json({ message: 'Admin account haiwezi kupewa role nyingine' })
      }
      await User.updateRoleForUser(id, role)
      res.json({ message: 'Role ya user imebadilishwa' })
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
