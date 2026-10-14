const express = require('express')
const router = express.Router()
const businessSettingsController = require('../controllers/businessSettingsController')
const { auth, adminOnly } = require('../middleware/auth')

// PUBLIC - login page na receipts zinahitaji hii bila kulogin
router.get('/', businessSettingsController.get)

// ADMIN ONLY - kubadilisha
router.put('/', auth, adminOnly, businessSettingsController.update)

module.exports = router
