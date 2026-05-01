const express = require('express')
const cors = require('cors')
require('dotenv').config()

const authRoutes = require('./routes/auth')
const productRoutes = require('./routes/products')
const clientRoutes = require('./routes/clients')
const saleRoutes = require('./routes/sales')
const reportRoutes = require('./routes/reports')
const purchaseRoutes = require('./routes/purchases')

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/clients', clientRoutes)
app.use('/api/sales', saleRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/purchases', purchaseRoutes)

app.get('/', (req, res) => {
  res.json({ message: 'Hardware POS API inafanya kazi!' })
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Server inaendesha kwenye port ${PORT}`)
})