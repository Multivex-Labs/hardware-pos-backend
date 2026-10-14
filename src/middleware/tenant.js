const master = require('../config/masterDb')
const tenantContext = require('../config/tenantContext')

const RESERVED = new Set(['www', 'admin', 'api', 'app', 'mail', 'platform'])
const CACHE_MS = 60 * 1000
const cache = new Map() // slug -> { tenant, expires }

function extractSlug(req) {
  // Kwa majaribio ya local tu: header X-Tenant (ALLOW_TENANT_HEADER=true). Production: false.
  if (process.env.ALLOW_TENANT_HEADER === 'true' && req.headers['x-tenant']) {
    return String(req.headers['x-tenant']).toLowerCase()
  }

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(':')[0]
    .toLowerCase()
  const base = (process.env.BASE_DOMAIN || '').toLowerCase()

  if (base && host.endsWith('.' + base)) return host.slice(0, -(base.length + 1))
  if (host.endsWith('.localhost')) return host.slice(0, -'.localhost'.length)
  return null
}

async function loadTenant(slug) {
  const hit = cache.get(slug)
  if (hit && hit.expires > Date.now()) return hit.tenant

  const [rows] = await master.execute('SELECT * FROM tenants WHERE slug = ? LIMIT 1', [slug])
  const tenant = rows[0] || null
  cache.set(slug, { tenant, expires: Date.now() + CACHE_MS })
  return tenant
}

function clearTenantCache(slug) {
  if (slug) cache.delete(slug)
  else cache.clear()
}

async function tenantMiddleware(req, res, next) {
  try {
    const slug = extractSlug(req)
    if (!slug || RESERVED.has(slug)) {
      return res.status(400).json({ message: 'Duka halijatambulika (subdomain haipo)' })
    }

    const tenant = await loadTenant(slug)
    if (!tenant) {
      return res.status(404).json({ message: 'Biashara hii haipo kwenye mfumo' })
    }

    if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
      return res
        .status(403)
        .json({ code: 'TENANT_SUSPENDED', message: 'Akaunti imesimamishwa. Wasiliana na Multivex Labs.' })
    }

    if (tenant.subscription_end) {
      const graceMs = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 7) * 86400000
      if (Date.now() > new Date(tenant.subscription_end).getTime() + graceMs) {
        return res
          .status(402)
          .json({ code: 'SUBSCRIPTION_EXPIRED', message: 'Subscription imeisha. Tafadhali lipia ili kuendelea.' })
      }
    }

    req.tenant = tenant
    return tenantContext.run({ dbName: tenant.db_name, tenant }, next)
  } catch (err) {
    console.error('tenant middleware error:', err.message)
    return res.status(500).json({ message: 'Tenant error' })
  }
}

module.exports = { tenantMiddleware, clearTenantCache }
