const jwt = require('jsonwebtoken')

module.exports = (...roles) => (req, res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'No token provided' })
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET)
    req.user = decoded
    if (roles.length && !roles.includes(decoded.role)) {
      return res.status(403).json({ message: 'Access denied' })
    }
    next()
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' })
  }
}
