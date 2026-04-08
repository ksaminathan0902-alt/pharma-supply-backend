const router = require('express').Router()
const prisma = require('../utils/prisma')
const auth = require('../middleware/auth')
const bcrypt = require('bcryptjs')

// GET /api/suppliers
router.get('/', auth('SYSTEM_ADMIN', 'HOSPITAL_STAFF', 'PHARMACY_STAFF'), async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      include: { _count: { select: { products: true, purchaseOrders: true } } },
      orderBy: { name: 'asc' },
    })
    res.json(suppliers)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/suppliers/:id
router.get('/:id', auth('SYSTEM_ADMIN'), async (req, res) => {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        products: { include: { product: true } },
        users: { select: { id: true, name: true, email: true, isActive: true } },
      },
    })
    if (!supplier) return res.status(404).json({ error: 'Not found' })
    res.json(supplier)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/suppliers
router.post('/', auth('SYSTEM_ADMIN'), async (req, res) => {
  try {
    const { name, contactPerson, email, phone, address, paymentTerms, createLogin, loginEmail, loginPassword } = req.body
    const supplier = await prisma.supplier.create({
      data: { name, contactPerson, email, phone, address, paymentTerms },
    })
    // Optionally create a supplier user account
    if (createLogin && loginEmail && loginPassword) {
      const hashed = await bcrypt.hash(loginPassword, 10)
      await prisma.user.create({
        data: { name: contactPerson || name, email: loginEmail, password: hashed, role: 'SUPPLIER', supplierId: supplier.id },
      })
    }
    res.json(supplier)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/suppliers/:id
router.put('/:id', auth('SYSTEM_ADMIN'), async (req, res) => {
  try {
    const { name, contactPerson, email, phone, address, paymentTerms } = req.body
    const supplier = await prisma.supplier.update({
      where: { id: Number(req.params.id) },
      data: { name, contactPerson, email, phone, address, paymentTerms },
    })
    res.json(supplier)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/suppliers/:id/products — link product to supplier with unit cost
router.post('/:id/products', auth('SYSTEM_ADMIN'), async (req, res) => {
  try {
    const { productId, unitCost, leadDays } = req.body
    const sp = await prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId: Number(req.params.id), productId: Number(productId) } },
      update: { unitCost: Number(unitCost), leadDays: Number(leadDays) || 7 },
      create: { supplierId: Number(req.params.id), productId: Number(productId), unitCost: Number(unitCost), leadDays: Number(leadDays) || 7 },
    })
    res.json(sp)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
