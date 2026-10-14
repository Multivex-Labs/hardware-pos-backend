const jwt = require('jsonwebtoken')
require('dotenv').config()

// Ulinzi wa admin panel ya Multivex (wewe tu). Secret yake ni tofauti na ya maduka.
const platformAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ message: 'Hujaingia' })

  try {
    const decoded = jwt.verify(token, process.env.PLATFORM_JWT_SECRET)
    if (decoded.scope !== 'platform') throw new Error('scope si sahihi')
    req.platformAdmin = decoded
    next()
  } catch (error) {
    res.status(401).json({ message: 'Token si sahihi au imeisha' })
  }
}

module.exports = platformAuth
