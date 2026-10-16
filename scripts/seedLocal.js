// Inaendeshwa na Docker kila backend inapowaka. Ni salama kurudiwa:
// inaunda admin na business_settings TU kama bado havipo.
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  for (let i = 1; i <= 40; i++) {
    try {
      return await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: process.env.DB_PORT || 3306,
        database: process.env.DB_NAME
      })
    } catch (e) {
      console.log(`[seed] Database bado haijawa tayari (${i}/40): ${e.code || e.message}`)
      await sleep(3000)
    }
  }
  throw new Error('Database haipatikani baada ya majaribio 40')
}

async function main() {
  const db = await connect()

  const [[users]] = await db.query('SELECT COUNT(*) AS n FROM users')
  if (users.n === 0) {
    const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
      throw new Error('ADMIN_EMAIL na ADMIN_PASSWORD (angalau herufi 8) zinahitajika kwenye .env')
    }
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10)
    await db.execute('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
      ADMIN_NAME || 'Admin',
      ADMIN_EMAIL,
      hash,
      'admin'
    ])
    console.log(`[seed] Admin ameundwa: ${ADMIN_EMAIL}`)
  }

  const [[settings]] = await db.query('SELECT COUNT(*) AS n FROM business_settings')
  if (settings.n === 0) {
    await db.execute('INSERT INTO business_settings (id, business_name) VALUES (1, ?)', [
      process.env.BUSINESS_NAME || 'My Shop'
    ])
    console.log('[seed] business_settings imewekwa')
  }

  await db.end()
}

main().catch((e) => {
  console.error('[seed] FAILED:', e.message)
  process.exit(1)
})
