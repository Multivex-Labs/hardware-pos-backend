const express = require('express')
const cors = require('cors')
require('dotenv').config()

const authRoutes = require('./routes/auth')
const productRoutes = require('./routes/products')
const clientRoutes = require('./routes/clients')
const saleRoutes = require('./routes/sales')
const returnRoutes = require('./routes/returns')
const auditLogRoutes = require('./routes/auditLogs')
const reportRoutes = require('./routes/reports')
const purchaseRoutes = require('./routes/purchases')
const adminRoutes = require('./routes/admin')
const expenseRoutes = require('./routes/expenses')
const businessSettingsRoutes = require('./routes/businessSettings')
const procurementRoutes = require('./routes/procurement')
const stockMovementRoutes = require('./routes/stockMovements')
const stockConversionRoutes = require('./routes/stockConversions')
const dispensingLogRoutes = require('./routes/dispensingLog') // MPYA - Pharmacy

const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/clients', clientRoutes)
app.use('/api/sales', saleRoutes)
app.use('/api/returns', returnRoutes)
app.use('/api/audit-logs', auditLogRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/purchases', purchaseRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/expenses', expenseRoutes)
app.use('/api/business-settings', businessSettingsRoutes)
app.use('/api/procurement', procurementRoutes)
app.use('/api/stock-movements', stockMovementRoutes)
app.use('/api/stock-conversions', stockConversionRoutes)
app.use('/api/dispensing-log', dispensingLogRoutes) // MPYA - Pharmacy

app.get('/', (req, res) => res.json({ message: 'Hardware POS API is running!', status: 'ok' }))

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ message: 'Something went wrong', error: err.message })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`))
