const router = require('express').Router()
const prisma = require('../utils/prisma')
const auth = require('../middleware/auth')

async function nextGRNNumber() {
  const year = new Date().getFullYear()
  const last = await prisma.goodsReceipt.findFirst({
    where: { grnNumber: { startsWith: `GRN-${year}-` } },
    orderBy: { id: 'desc' },
  })
  const seq = last ? parseInt(last.grnNumber.split('-')[2]) + 1 : 1
  return `GRN-${year}-${String(seq).padStart(4, '0')}`
}

// GET /api/grn
router.get('/', auth('SYSTEM_ADMIN', 'HOSPITAL_STAFF', 'PHARMACY_STAFF'), async (req, res) => {
  try {
    const grns = await prisma.goodsReceipt.findMany({
      include: {
        po: { select: { id: true, poNumber: true, supplier: { select: { name: true } } } },
        receivedBy: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, unit: true } } } },
      },
      orderBy: { receivedAt: 'desc' },
    })
    res.json(grns)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/grn — receive goods against a PO
router.post('/', auth('SYSTEM_ADMIN', 'HOSPITAL_STAFF', 'PHARMACY_STAFF'), async (req, res) => {
  try {
    const { poId, notes, items } = req.body
    // items: [{ productId, poItemId, receivedQty, batchNo, expiryDate, condition, unitCost }]

    const grnNumber = await nextGRNNumber()

    // Determine if fully delivered or partially
    const poItems = await prisma.purchaseOrderItem.findMany({ where: { poId: Number(poId) } })
    let fullyDelivered = true

    const grn = await prisma.$transaction(async (tx) => {
      // Create GRN
      const receipt = await tx.goodsReceipt.create({
        data: {
          grnNumber,
          poId: Number(poId),
          receivedById: req.user.id,
          notes,
          items: {
            create: items.map(i => ({
              productId: Number(i.productId),
              receivedQty: Number(i.receivedQty),
              batchNo: i.batchNo,
              expiryDate: i.expiryDate ? new Date(i.expiryDate) : null,
              condition: i.condition || 'Good',
              unitCost: Number(i.unitCost),
            })),
          },
        },
      })

      // Update PO item received quantities + stock levels
      for (const item of items) {
        const qty = Number(item.receivedQty)
        // Update PO item
        await tx.purchaseOrderItem.update({
          where: { id: Number(item.poItemId) },
          data: { receivedQty: { increment: qty } },
        })
        // Update stock level
        await tx.stockLevel.upsert({
          where: { productId: Number(item.productId) },
          update: { currentStock: { increment: qty } },
          create: { productId: Number(item.productId), currentStock: qty },
        })
        // Record stock transaction
        await tx.stockTransaction.create({
          data: {
            productId: Number(item.productId),
            type: 'IN',
            qty,
            reference: grnNumber,
            notes: `Received via ${grnNumber} from PO ${poId}`,
            createdBy: req.user.id,
          },
        })
      }

      // Check if all PO items fully received
      for (const poItem of poItems) {
        const receivedItem = items.find(i => Number(i.poItemId) === poItem.id)
        const totalReceived = poItem.receivedQty + (receivedItem ? Number(receivedItem.receivedQty) : 0)
        if (totalReceived < poItem.qty) fullyDelivered = false
      }

      // Update PO status
      await tx.purchaseOrder.update({
        where: { id: Number(poId) },
        data: {
          status: fullyDelivered ? 'DELIVERED' : 'PARTIALLY_DELIVERED',
          deliveredAt: fullyDelivered ? new Date() : undefined,
        },
      })

      return receipt
    })

    res.json({ success: true, grn, fullyDelivered })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
