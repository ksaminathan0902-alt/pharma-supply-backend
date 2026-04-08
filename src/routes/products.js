const router = require('express').Router()
const prisma = require('../utils/prisma')
const auth = require('../middleware/auth')

// GET /api/products
router.get('/', auth(), async (req, res) => {
  try {
    const { supplierId, categoryId, search, lowStock } = req.query
    const where = { isActive: true }
    if (categoryId) where.categoryId = Number(categoryId)
    if (search) where.name = { contains: search }
    if (supplierId) where.suppliers = { some: { supplierId: Number(supplierId) } }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
        stockLevels: true,
        suppliers: { include: { supplier: { select: { id: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    })

    let result = products.map(p => ({
      ...p,
      currentStock: p.stockLevels[0]?.currentStock ?? 0,
      stockStatus: (p.stockLevels[0]?.currentStock ?? 0) === 0 ? 'OUT_OF_STOCK'
        : (p.stockLevels[0]?.currentStock ?? 0) <= p.reorderLevel ? 'LOW' : 'OK',
    }))

    if (lowStock === 'true') result = result.filter(p => p.stockStatus !== 'OK')
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/products/categories
router.get('/categories', auth(), async (req, res) => {
  try {
    const cats = await prisma.productCategory.findMany({ orderBy: { name: 'asc' } })
    res.json(cats)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/products/:id
router.get('/:id', auth(), async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        category: true,
        stockLevels: true,
        suppliers: { include: { supplier: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
    if (!product) return res.status(404).json({ error: 'Not found' })
    res.json(product)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/products/categories
router.post('/categories', auth('SYSTEM_ADMIN'), async (req, res) => {
  try {
    const cat = await prisma.productCategory.create({ data: { name: req.body.name } })
    res.json(cat)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/products
router.post('/', auth('SYSTEM_ADMIN'), async (req, res) => {
  try {
    const { name, sku, description, unit, reorderLevel, categoryId } = req.body
    const product = await prisma.product.create({
      data: { name, sku, description, unit, reorderLevel: Number(reorderLevel) || 0, categoryId: Number(categoryId) },
    })
    // Init stock level
    await prisma.stockLevel.create({ data: { productId: product.id, currentStock: 0 } })
    res.json(product)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/products/:id
router.put('/:id', auth('SYSTEM_ADMIN'), async (req, res) => {
  try {
    const { name, sku, description, unit, reorderLevel, categoryId } = req.body
    const product = await prisma.product.update({
      where: { id: Number(req.params.id) },
      data: { name, sku, description, unit, reorderLevel: Number(reorderLevel), categoryId: Number(categoryId) },
    })
    res.json(product)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
