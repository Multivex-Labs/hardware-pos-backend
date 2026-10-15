const { verifyToken } = require('../utils/tenantJwt')
const User = require('../models/User')
const { resolvePermissions } = require('../utils/permissions')

// req.tenant inawekwa na tenant middleware (mode ya multi-tenant).
// Bila multi-tenant, req.tenant haipo na JWT_SECRET ya .env inatumika kama zamani.
const auth = (req, res, next) => {
  if (req.user) return next()
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
  if (req.user.role !== 'admin' && !req.permissionGranted) {
    return res.status(403).json({ message: 'Admin peke yake anaweza kufanya hivi' })
  }
  next()
}

// Generalized version - requireRole('admin', 'manager') inaruhusu roles nyingi.
// Hii ni ulinzi wa server-side (sio UI-only) - hata request ikitumwa moja kwa moja
// kupitia Postman/browser console, itakataliwa kama role ya mtumiaji haiendani.
const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user || (!allowedRoles.includes(req.user.role) && !req.permissionGranted)) {
    return res.status(403).json({ message: 'You do not have permission to perform this action' })
  }
  next()
}

const moduleByRoute = {
  products: 'inventory',
  'stock-movements': 'inventory',
  'stock-conversions': 'inventory',
  sales: 'sales',
  returns: 'sales',
  'dispensing-log': 'dispensing',
  procurement: 'procurement',
  purchases: 'purchases',
  purchase: 'purchases',
  expenses: 'expenses',
  clients: 'clients',
  reports: 'reports',
  'audit-logs': 'reports',
  'business-settings': 'settings',
  admin: 'settings'
}

function permissionAction(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return 'view'
  if (req.method === 'DELETE') return 'delete'
  if (req.method === 'PUT' || req.method === 'PATCH') return 'edit'
  if (req.method === 'POST' && ['/stock-movements/adjustment', '/stock-conversions'].includes(req.path)) return 'edit'
  if (req.method === 'POST' && /\/(void|edit)(\/|$)/.test(req.path)) return 'edit'
  if (req.method === 'POST') return 'create'
  return null
}

const permissionGate = (req, res, next) => {
  if (req.method === 'OPTIONS' || req.path === '/auth/login') return next()
  if (req.path === '/business-settings' && req.method === 'GET') return next()

  auth(req, res, () => {
    const module = req.path === '/sales/add-deposit'
      ? 'clients'
      : req.path === '/auth/register' || req.path.startsWith('/auth/users')
      ? 'users'
      : moduleByRoute[req.path.split('/')[1]]
    const action = permissionAction(req)
    if (!module || !action) return next()

    User.findById(req.user.id)
      .then(user => {
        if (!user) return res.status(401).json({ message: 'Akaunti haipo tena' })
        req.user.role = user.role
        const permissions = resolvePermissions(user.permissions, user.role)
        req.permissionGranted =
          user.role === 'admin' || Boolean(permissions[module]?.includes(action))
        if (!req.permissionGranted) {
          return res.status(403).json({ message: 'Huna ruhusa ya kufanya kitendo hiki' })
        }
        return next()
      })
      .catch(next)
  })
}

module.exports = { auth, adminOnly, requireRole, permissionGate }
