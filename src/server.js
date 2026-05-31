const express = require('express')
const cors = require('cors')
require('dotenv').config()

const authRoutes = require('./routes/auth')
const productRoutes = require('./routes/products')
const clientRoutes = require('./routes/clients')
const saleRoutes = require('./routes/sales')
const reportRoutes = require('./routes/reports')
const purchaseRoutes = require('./routes/purchases')
const adminRoutes = require('./routes/admin')

const app = express()

// CORS — allow frontend domain (update FRONTEND_URL in Railway env vars)
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/clients', clientRoutes)
app.use('/api/sales', saleRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/purchases', purchaseRoutes)
app.use('/api/admin', adminRoutes)

app.get('/', (req, res) => {
  res.json({ message: 'Hardware POS API is running!', status: 'ok' })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ message: 'Something went wrong', error: err.message })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})
