const router = require('express').Router()
const prisma = require('../utils/prisma')
const auth = require('../middleware/auth')

// GET /api/stock — all stock levels
router.get('/', auth(), async (req, res) => {
  try {
    const levels = await prisma.stockLevel.findMany({
      include: {
        product: { include: { category: true, suppliers: { include: { supplier: { select: { id: true, name: true } } } } } },
      },
      orderBy: { product: { name: 'asc' } },
    })
    const result = levels.map(l => ({
      ...l,
      stockStatus: l.currentStock === 0 ? 'OUT_OF_STOCK' : l.currentStock <= l.product.reorderLevel ? 'LOW' : 'OK',
    }))
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/stock/:productId/movements
router.get('/:productId/movements', auth(), async (req, res) => {
  try {
    const txns = await prisma.stockTransaction.findMany({
      where: { productId: Number(req.params.productId) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json(txns)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/stock/issue — issue stock to a department
router.post('/issue', auth('SYSTEM_ADMIN', 'HOSPITAL_STAFF', 'PHARMACY_STAFF'), async (req, res) => {
  try {
    const { productId, qty, department, notes } = req.body
    const level = await prisma.stockLevel.findUnique({ where: { productId: Number(productId) } })
    if (!level || level.currentStock < Number(qty)) {
      return res.status(400).json({ error: 'Insufficient stock' })
    }
    await prisma.$transaction([
      prisma.stockLevel.update({
        where: { productId: Number(productId) },
        data: { currentStock: { decrement: Number(qty) } },
      }),
      prisma.stockTransaction.create({
        data: {
          productId: Number(productId),
          type: 'OUT',
          qty: Number(qty),
          reference: department,
          notes: notes || `Issued to ${department}`,
          createdBy: req.user.id,
        },
      }),
    ])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
