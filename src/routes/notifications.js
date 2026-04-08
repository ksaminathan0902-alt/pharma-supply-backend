const router = require('express').Router()
const prisma = require('../utils/prisma')
const auth = require('../middleware/auth')

// GET /api/notifications
router.get('/', auth(), async (req, res) => {
  try {
    const notifs = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    res.json(notifs)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/notifications/:id/read
router.put('/:id/read', auth(), async (req, res) => {
  try {
    await prisma.notification.update({ where: { id: Number(req.params.id) }, data: { status: 'READ' } })
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/notifications/read-all
router.put('/read-all', auth(), async (req, res) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.id, status: 'UNREAD' }, data: { status: 'READ' } })
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
