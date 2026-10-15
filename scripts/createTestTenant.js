// Inatengeneza duka la pili la majaribio (database mpya + admin) ili kuthibitisha isolation.
// Run:  node scripts/createTestTenant.js
// Au:   node scripts/createTestTenant.js slug "Jina la Duka" admin@email.com Password123
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

let prov = null
const candidates = [
  '../src/services/tenantProvisioner',
  '../src/utils/tenantProvisioner',
  '../src/config/tenantProvisioner',
  '../src/tenantProvisioner'
]
for (const p of candidates) {
  try {
    prov = require(p)
    break
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND' || !String(e.message).includes('tenantProvisioner')) throw e
  }
}
if (!prov) {
  console.error('tenantProvisioner.js haikupatikana. Niambie iko folder gani ndani ya src/.')
  process.exit(1)
}

const [slug = 'shop2', businessName = 'Second Test Shop', adminEmail = 'admin@shop2.test', adminPassword = 'ChangeMe12345'] =
  process.argv.slice(2)

prov
  .provisionTenant({ slug, businessName, plan: 'starter', adminName: 'Shop Admin', adminEmail, adminPassword })
  .then((r) => {
    console.log('\nDuka limeundwa ✅')
    console.log(r)
    console.log(`\nFungua: http://${slug}.localhost:5173`)
    console.log(`Login:  ${adminEmail} / ${adminPassword}`)
    process.exit(0)
  })
  .catch((e) => {
    console.error('FAILED:', e.message)
    process.exit(1)
  })
