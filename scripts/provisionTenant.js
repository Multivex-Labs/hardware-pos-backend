// Duka JIPYA:
//   node scripts/provisionTenant.js new demo "Demo Shop" starter admin@demo.co.tz "Pass12345"
// Duka lenye database iliyopo tayari (mfano hardware_pos ya majaribio):
//   node scripts/provisionTenant.js existing demo "Demo Shop" hardware_pos business
require('dotenv').config()
const { provisionTenant, registerExistingTenant } = require('../src/services/tenantProvisioner')

async function main() {
  const [mode, ...a] = process.argv.slice(2)

  if (mode === 'new') {
    const [slug, businessName, plan, adminEmail, adminPassword] = a
    console.log(
      await provisionTenant({ slug, businessName, plan, adminEmail, adminPassword, adminName: 'Admin' })
    )
  } else if (mode === 'existing') {
    const [slug, businessName, dbName, plan] = a
    console.log(await registerExistingTenant({ slug, businessName, dbName, plan }))
  } else {
    console.log('Matumizi: angalia maelezo juu ya file hii')
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('IMESHINDIKANA:', err.message)
  process.exit(1)
})
