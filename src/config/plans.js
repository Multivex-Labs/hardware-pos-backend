// Bei zote mahali pamoja. Rate: 1 USD = TSh 2,500 (badilisha hapa tu ukihitaji).
const USD_TO_TZS = 2500

const PLANS = {
  starter: { name: 'Starter', monthlyTzs: 60000, maxUsers: 3 },
  business: { name: 'Business', monthlyTzs: 120000, maxUsers: 10 },
  pro: { name: 'Pro', monthlyTzs: 200000, maxUsers: 50 },
  pharmacy: { name: 'Pharmacy', monthlyTzs: 180000, maxUsers: 15 }
}

const withUsd = (tzs) => ({ tzs, usd: Math.round((tzs / USD_TO_TZS) * 100) / 100 })

module.exports = { PLANS, USD_TO_TZS, withUsd }
