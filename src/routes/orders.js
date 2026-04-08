const router = require('express').Router()
const prisma = require('../utils/prisma')
const auth = require('../middleware/auth')

async function nextPONumber() {
  const year = new Date().getFullYear()
  const last = await prisma.purchaseOrder.findFirst({
    where: { poNumber: { startsWith: `PO-${year}-` } },
    orderBy: { id: 'desc' },
  })
  const seq = last ? parseInt(last.poNumber.split('-')[2]) + 1 : 1
  return `PO-${year}-${String(seq).padStart(4, '0')}`
}

async function notify(prisma, userId, title, message, link) {
  await prisma.notification.create({ data: { userId, title, message, link } })
}

// GET /api/orders
router.get('/', auth(), async (req, res) => {
  try {
    const { status, supplierId } = req.query
    const where = {}
    if (status) where.status = status
    // Supplier sees only their own orders
    if (req.user.role === 'SUPPLIER') where.supplierId = req.user.supplierId
    if (supplierId && req.user.role !== 'SUPPLIER') where.supplierId = Number(supplierId)

    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, unit: true } } } },
        _count: { select: { items: true, grns: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(orders)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/orders/:id
router.get('/:id', auth(), async (req, res) => {
  try {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        supplier: true,
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        items: { include: { product: { include: { category: true } } } },
        grns: { include: { items: { include: { product: true } }, receivedBy: { select: { id: true, name: true } } } },
      },
    })
    if (!order) return res.status(404).json({ error: 'Not found' })
    // Supplier can only see their own
    if (req.user.role === 'SUPPLIER' && order.supplierId !== req.user.supplierId) {
      return res.status(403).json({ error: 'Access denied' })
    }
    res.json(order)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/orders — create draft PO
router.post('/', auth('SYSTEM_ADMIN', 'HOSPITAL_STAFF', 'PHARMACY_STAFF'), async (req, res) => {
  try {
    const { supplierId, department, notes, items } = req.body
    const poNumber = await nextPONumber()
    let total = 0
    const order = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: Number(supplierId),
        department,
        notes,
        createdById: req.user.id,
        status: 'DRAFT',
        totalAmount: 0,
        items: {
          create: items.map(i => {
            const lineTotal = Number(i.unitCost) * Number(i.qty)
            total += lineTotal
            return { productId: Number(i.productId), qty: Number(i.qty), unitCost: Number(i.unitCost), total: lineTotal }
          }),
        },
      },
      include: { items: { include: { product: true } }, supplier: true },
    })
    await prisma.purchaseOrder.update({ where: { id: order.id }, data: { totalAmount: total } })
    res.json({ ...order, totalAmount: total })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/orders/:id/submit — submit for approval
router.put('/:id/submit', auth('SYSTEM_ADMIN', 'HOSPITAL_STAFF', 'PHARMACY_STAFF'), async (req, res) => {
  try {
    const order = await prisma.purchaseOrder.update({
      where: { id: Number(req.params.id) },
      data: { status: 'PENDING_APPROVAL' },
    })
    // Notify all admins
    const admins = await prisma.user.findMany({ where: { role: 'SYSTEM_ADMIN' } })
    for (const admin of admins) {
      await notify(prisma, admin.id, 'New PO Pending Approval', `Purchase Order ${order.poNumber} requires your approval`, `/orders/${order.id}`)
    }
    res.json(order)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/orders/:id/approve
router.put('/:id/approve', auth('SYSTEM_ADMIN'), async (req, res) => {
  try {
    const order = await prisma.purchaseOrder.update({
      where: { id: Number(req.params.id) },
      data: { status: 'APPROVED', approvedById: req.user.id, approvedAt: new Date() },
    })
    res.json(order)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/orders/:id/send — send to supplier
router.put('/:id/send', auth('SYSTEM_ADMIN'), async (req, res) => {
  try {
    const order = await prisma.purchaseOrder.update({
      where: { id: Number(req.params.id) },
      data: { status: 'SENT_TO_SUPPLIER', sentAt: new Date() },
      include: { supplier: { include: { users: true } } },
    })
    // Notify supplier users
    for (const u of order.supplier.users) {
      await notify(prisma, u.id, 'New Purchase Order Received', `You have a new order ${order.poNumber} to review`, `/orders/${order.id}`)
    }
    res.json(order)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/orders/:id/confirm — supplier confirms
router.put('/:id/confirm', auth('SYSTEM_ADMIN', 'SUPPLIER'), async (req, res) => {
  try {
    const order = await prisma.purchaseOrder.update({
      where: { id: Number(req.params.id) },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    })
    // Notify order creator
    await notify(prisma, order.createdById, 'Order Confirmed by Supplier', `${order.poNumber} has been confirmed by the supplier`, `/orders/${order.id}`)
    res.json(order)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/orders/:id/dispatch — supplier dispatches
router.put('/:id/dispatch', auth('SYSTEM_ADMIN', 'SUPPLIER'), async (req, res) => {
  try {
    const { dispatchRef, driverName, vehicleNo, expectedDelivery } = req.body
    const order = await prisma.purchaseOrder.update({
      where: { id: Number(req.params.id) },
      data: {
        status: 'DISPATCHED', dispatchedAt: new Date(),
        dispatchRef, driverName, vehicleNo,
        expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
      },
    })
    await notify(prisma, order.createdById, 'Order Dispatched', `${order.poNumber} is on the way. Driver: ${driverName || 'N/A'}, Vehicle: ${vehicleNo || 'N/A'}`, `/orders/${order.id}`)
    res.json(order)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/orders/:id/cancel
router.put('/:id/cancel', auth('SYSTEM_ADMIN'), async (req, res) => {
  try {
    const order = await prisma.purchaseOrder.update({
      where: { id: Number(req.params.id) },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })
    res.json(order)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
