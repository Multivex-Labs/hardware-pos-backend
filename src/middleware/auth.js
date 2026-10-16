const { verifyToken } = require('../utils/tenantJwt')
const User = require('../models/User')
const { resolvePermissions } = require('../utils/permissions')
const BusinessSettings = require('../models/businessSettings')

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

const pharmacyOnly = async (req, res, next) => {
  try {
    const settings = await BusinessSettings.get()
    if (settings?.business_type !== 'pharmacy') return res.status(404).json({ message: 'Pharmacy module is not enabled for this business' })
    next()
  } catch (error) { next(error) }
}

const moduleByRoute = {
  products: 'inventory',
  'stock-movements': 'inventory',
  'stock-conversions': 'inventory',
  sales: 'sales',
  returns: 'sales',
  'dispensing-log': 'dispensing',
  pharmacy: 'inventory',
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

const dashboardReportPaths = new Set(['/today', '/last-seven-days'])

function permissionAction(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return 'view'
  if (req.method === 'DELETE') return 'delete'
  if (req.method === 'PUT' || req.method === 'PATCH') return 'edit'
  if (req.method === 'POST' && ['/stock-movements/adjustment', '/stock-conversions'].includes(req.path)) return 'edit'
  if (req.method === 'POST' && /\/pharmacy\/batches\/\d+\/adjustment$/.test(req.path)) return 'edit'
  if (req.method === 'POST' && /\/(void|edit)(\/|$)/.test(req.path)) return 'edit'
  if (req.method === 'POST') return 'create'
  return null
}

const permissionGate = (req, res, next) => {
  if (req.method === 'OPTIONS' || req.path === '/auth/login') return next()
  if (req.path === '/business-settings' && req.method === 'GET' && !req.header('Authorization')) return next()

  auth(req, res, () => {
    const allowedDuringPasswordChange =
      req.path === '/auth/me' ||
      (req.path === '/auth/password' && req.method === 'PUT')

    User.findById(req.user.id)
      .then(user => {
        if (!user) return res.status(401).json({ message: 'Akaunti haipo tena' })
        req.user.role = user.role
        req.user.must_change_password = Boolean(user.must_change_password)
        if (user.must_change_password && !allowedDuringPasswordChange) {
          return res.status(403).json({
            code: 'PASSWORD_CHANGE_REQUIRED',
            message: 'Badilisha password yako kwanza kabla ya kutumia POS'
          })
        }
        if (req.path === '/business-settings' && req.method === 'GET') return next()

        const module = req.path.startsWith('/pharmacy/prescriptions') || req.path === '/pharmacy/eligible-batches'
          ? 'dispensing'
          : req.path === '/pharmacy/expiry-summary' || (req.path === '/pharmacy/batches' && req.query.status === 'expiry') || req.path === '/products/expiring-soon'
          ? 'expiry'
          : req.path === '/sales/add-deposit'
          ? 'clients'
          : req.path === '/pharmacy/batches/receive'
          ? 'procurement'
          : req.path === '/auth/register' || req.path.startsWith('/auth/users')
          ? 'users'
          : moduleByRoute[req.path.split('/')[1]]
        const action = permissionAction(req)
        if (!module || !action) return next()

        const permissions = resolvePermissions(user.permissions, user.role)
        const canViewDashboardReport =
          req.path.startsWith('/reports/') &&
          dashboardReportPaths.has(req.path.slice('/reports'.length)) &&
          action === 'view' &&
          Boolean(permissions.dashboard?.includes('view'))
        req.permissionGranted =
          user.role === 'admin' ||
          Boolean(permissions[module]?.includes(action)) ||
          canViewDashboardReport
        if (!req.permissionGranted) {
          return res.status(403).json({ message: 'Huna ruhusa ya kufanya kitendo hiki' })
        }
        return next()
      })
      .catch(next)
  })
}

module.exports = { auth, adminOnly, requireRole, pharmacyOnly, permissionGate }
