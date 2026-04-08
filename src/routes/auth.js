const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')
const auth = require('../middleware/auth')

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' })

    const user = await prisma.user.findUnique({
      where: { email },
      include: { supplier: { select: { id: true, name: true } } },
    })
    if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' })

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, supplierId: user.supplierId },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, supplier: user.supplier },
    })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// GET /api/auth/me
router.get('/me', auth(), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, supplier: { select: { id: true, name: true } } },
    })
    res.json(user)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// POST /api/auth/seed — creates default admin + test users
router.post('/seed', async (req, res) => {
  try {
    const users = [
      { name: 'System Admin',    email: 'admin@inventory.com',    password: 'admin123',    role: 'SYSTEM_ADMIN' },
      { name: 'Hospital Store',  email: 'hospital@inventory.com', password: 'hospital123', role: 'HOSPITAL_STAFF' },
      { name: 'Pharmacy Store',  email: 'pharmacy@inventory.com', password: 'pharmacy123', role: 'PHARMACY_STAFF' },
    ]
    const created = []
    for (const u of users) {
      const exists = await prisma.user.findUnique({ where: { email: u.email } })
      if (!exists) {
        const hashed = await bcrypt.hash(u.password, 10)
        await prisma.user.create({ data: { ...u, password: hashed } })
        created.push(u.email)
      }
    }
    res.json({ success: true, created })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

module.exports = router
