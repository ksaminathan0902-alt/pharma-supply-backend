const express = require('express')
const cors    = require('cors')
const morgan  = require('morgan')
require('dotenv').config()

const app = express()
app.use(cors({ origin: '*' }))
app.use(express.json())
app.use(morgan('dev'))

app.use('/api/auth',          require('./routes/auth'))
app.use('/api/suppliers',     require('./routes/suppliers'))
app.use('/api/products',      require('./routes/products'))
app.use('/api/orders',        require('./routes/orders'))
app.use('/api/grn',           require('./routes/grn'))
app.use('/api/stock',         require('./routes/stock'))
app.use('/api/notifications', require('./routes/notifications'))
app.use('/api/dashboard',     require('./routes/dashboard'))
app.use('/api/seed',          require('./routes/seed'))

app.get('/api/health', (req, res) => res.json({ status: 'Inventory API running' }))

app.listen(process.env.PORT || 5001, () => {
  console.log(`Inventory API running on port ${process.env.PORT || 5001}`)
})
