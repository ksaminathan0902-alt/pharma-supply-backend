const router = require('express').Router()
const prisma = require('../utils/prisma')
const auth = require('../middleware/auth')

router.get('/', auth(), async (req, res) => {
  try {
    const role = req.user.role
    const supplierId = req.user.supplierId

    if (role === 'SUPPLIER') {
      const [pending, confirmed, dispatched, totalOrders] = await Promise.all([
        prisma.purchaseOrder.count({ where: { supplierId, status: 'SENT_TO_SUPPLIER' } }),
        prisma.purchaseOrder.count({ where: { supplierId, status: 'CONFIRMED' } }),
        prisma.purchaseOrder.count({ where: { supplierId, status: 'DISPATCHED' } }),
        prisma.purchaseOrder.count({ where: { supplierId } }),
      ])
      const recentOrders = await prisma.purchaseOrder.findMany({
        where: { supplierId },
        include: { items: { include: { product: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })
      return res.json({ pending, confirmed, dispatched, totalOrders, recentOrders })
    }

    // ADMIN / STAFF dashboard
    const [pendingApproval, approved, dispatched, delivered, lowStock, outOfStock, unreadNotifs] = await Promise.all([
      prisma.purchaseOrder.count({ where: { status: 'PENDING_APPROVAL' } }),
      prisma.purchaseOrder.count({ where: { status: { in: ['APPROVED', 'SENT_TO_SUPPLIER', 'CONFIRMED'] } } }),
      prisma.purchaseOrder.count({ where: { status: 'DISPATCHED' } }),
      prisma.purchaseOrder.count({ where: { status: 'DELIVERED' } }),
      prisma.stockLevel.count({ where: { currentStock: { gt: 0, lte: 50 }, product: { reorderLevel: { gt: 0 } } } }),
      prisma.stockLevel.count({ where: { currentStock: 0 } }),
      prisma.notification.count({ where: { userId: req.user.id, status: 'UNREAD' } }),
    ])

    const recentOrders = await prisma.purchaseOrder.findMany({
      include: { supplier: { select: { name: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    const lowStockItems = await prisma.stockLevel.findMany({
      where: { currentStock: { gt: 0 } },
      include: { product: { select: { name: true, reorderLevel: true, unit: true } } },
      take: 5,
      orderBy: { currentStock: 'asc' },
    })

    res.json({ pendingApproval, approved, dispatched, delivered, lowStock, outOfStock, unreadNotifs, recentOrders, lowStockItems })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
