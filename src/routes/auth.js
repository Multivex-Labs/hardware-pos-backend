const express = require('express')
const router = express.Router()
const authController = require('../controllers/authController')
const { auth, adminOnly } = require('../middleware/auth')

// Register — sasa ni admin only, lazima ulogin kwanza kama admin
// ndio uweze kuunda user mpya (cashier au admin)
router.post('/register', auth, adminOnly, authController.register)

// Login
router.post('/login', authController.login)

// Get current user (protected)
router.get('/me', auth, authController.me)

// Pata users wote — admin only
router.get('/users', auth, adminOnly, authController.getAllUsers)
router.put('/users/:id/role', auth, adminOnly, authController.updateUserRole)

// Futa user — admin only
router.delete('/users/:id', auth, adminOnly, authController.deleteUser)
router.get('/roles', auth, adminOnly, authController.getRoles)
router.post('/roles', auth, adminOnly, authController.createRole)
router.put('/roles/:name', auth, adminOnly, authController.updateRole)
router.delete('/roles/:name', auth, adminOnly, authController.removeRole)

module.exports = router
