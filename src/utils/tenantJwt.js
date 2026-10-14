// JWT ya kila duka inasainiwa na secret ya duka hilo.
// Token ya duka moja haiwezi kutumika duka lingine, hata ikiibiwa.
// tenant = null  -> mode ya zamani (JWT_SECRET moja kutoka .env)
const jwt = require('jsonwebtoken')
require('dotenv').config()

function secretFor(tenant) {
  const secret = tenant ? tenant.jwt_secret : process.env.JWT_SECRET
  if (!secret) throw new Error('JWT secret haipo')
  return secret
}

function signToken(payload, tenant, expiresIn = '8h') {
  const body = tenant ? { ...payload, tid: tenant.slug } : payload
  return jwt.sign(body, secretFor(tenant), { expiresIn })
}

function verifyToken(token, tenant) {
  const decoded = jwt.verify(token, secretFor(tenant))
  if (tenant && decoded.tid !== tenant.slug) {
    throw new Error('Token si ya duka hili')
  }
  return decoded
}

module.exports = { signToken, verifyToken }
