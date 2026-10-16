require('dotenv').config()
const fs = require('fs')
const path = require('path')
const master = require('../src/config/masterDb')

async function main() {
  const filename = path.join(__dirname, '../sql/platform_customer_hub.sql')
  const statements = fs.readFileSync(filename, 'utf8')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await master.query(statement)
  }
  const [columns] = await master.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_customers' AND COLUMN_NAME = 'customer_type'`
  )
  if (!columns.length) {
    await master.query(
      "ALTER TABLE platform_customers ADD COLUMN customer_type ENUM('local', 'one_time') NOT NULL DEFAULT 'local' AFTER tenant_id"
    )
  }
  const [tenantBillingColumns] = await master.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'billing_type'`
  )
  if (!tenantBillingColumns.length) {
    await master.query(
      "ALTER TABLE tenants ADD COLUMN billing_type ENUM('monthly', 'one_time') NOT NULL DEFAULT 'monthly' AFTER plan"
    )
  }
  console.log('Platform customer hub tables are ready.')
}

main()
  .catch((err) => {
    console.error('Platform customer hub migration failed:', err.message)
    process.exitCode = 1
  })
  .finally(() => master.end())
