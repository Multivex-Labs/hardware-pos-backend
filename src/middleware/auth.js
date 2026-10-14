const { verifyToken } = require('../utils/tenantJwt')

// req.tenant inawekwa na tenant middleware (mode ya multi-tenant).
// Bila multi-tenant, req.tenant haipo na JWT_SECRET ya .env inatumika kama zamani.
const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ message: 'Hakuna token — ingia kwanza' })
    }

    const decoded = verifyToken(token, req.tenant || null)
    req.user = decoded
    next()
  } catch (error) {
    res.status(401).json({ message: 'Token si sahihi au imeisha' })
  }
}

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin peke yake anaweza kufanya hivi' })
  }
  next()
}

// Generalized version - requireRole('admin', 'manager') inaruhusu roles nyingi.
// Hii ni ulinzi wa server-side (sio UI-only) - hata request ikitumwa moja kwa moja
// kupitia Postman/browser console, itakataliwa kama role ya mtumiaji haiendani.
const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to perform this action' })
  }
  next()
}

module.exports = { auth, adminOnly, requireRole }
