// Matumizi (ukiwa kwenye folder la hardware-pos-web):
//   node scripts/createPlatformAdmin.js "Revo" revo@multivex.co.tz "PasswordYako123"
require('dotenv').config()
const bcrypt = require('bcryptjs')
const master = require('../src/config/masterDb')

async function main() {
  const [name, email, password] = process.argv.slice(2)
  if (!name || !email || !password || password.length < 8) {
    console.log('Matumizi: node scripts/createPlatformAdmin.js "Jina" email password(herufi 8+)')
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 10)
  await master.execute('INSERT INTO platform_admins (name, email, password) VALUES (?, ?, ?)', [
    name,
    email,
    hash
  ])
  console.log('Platform admin ameundwa:', email)
  process.exit(0)
}

main().catch((err) => {
  console.error('IMESHINDIKANA:', err.message)
  process.exit(1)
})
