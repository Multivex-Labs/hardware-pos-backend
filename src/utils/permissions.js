const ACTIONS = ['view', 'create', 'edit', 'delete']
const SYSTEM_ROLES = ['admin', 'manager', 'cashier']

const DEFAULT_PERMISSIONS = {
  admin: {
    dashboard: ACTIONS,
    sales: ACTIONS,
    inventory: ACTIONS,
    dispensing: ACTIONS,
    procurement: ACTIONS,
    purchases: ACTIONS,
    expenses: ACTIONS,
    clients: ACTIONS,
    reports: ACTIONS
  },
  manager: {
    dashboard: ['view'],
    sales: ['view', 'create', 'edit'],
    inventory: ['view', 'edit'],
    dispensing: ['view', 'create'],
    procurement: ['view'],
    purchases: ['view'],
    expenses: ['view'],
    clients: ['view', 'create', 'edit'],
    reports: ['view']
  },
  cashier: {
    dashboard: ['view'],
    sales: ['view', 'create'],
    inventory: ['view'],
    dispensing: ['view', 'create']
  }
}

function resolvePermissions(value, role) {
  if (value == null || value === '') {
    const defaults = DEFAULT_PERMISSIONS[role]
    if (defaults) return defaults
    return {}
  }
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored user permissions are invalid')
  }
  return parsed
}

function validateRoleName(value) {
  if (typeof value !== 'string') return null
  const name = value.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 40 || !/^[\p{L}\p{N} _-]+$/u.test(name)) return null
  if (SYSTEM_ROLES.includes(name.toLowerCase())) return null
  return name
}

function isValidPermissions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const modules = Object.keys(DEFAULT_PERMISSIONS.admin)
  return Object.entries(value).every(([module, actions]) =>
    modules.includes(module) &&
    Array.isArray(actions) &&
    actions.every(action => ACTIONS.includes(action)) &&
    (actions.length === 0 || actions.includes('view')) &&
    (module !== 'dashboard' || actions.every(action => action === 'view')) &&
    new Set(actions).size === actions.length
  )
}

module.exports = {
  ACTIONS,
  DEFAULT_PERMISSIONS,
  SYSTEM_ROLES,
  resolvePermissions,
  validateRoleName,
  isValidPermissions
}
