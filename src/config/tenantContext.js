// AsyncLocalStorage = "global ya request moja".
// Kila request ina tenant yake, na models zako zinaendelea kutumia db.execute() bila kubadilishwa.
const { AsyncLocalStorage } = require('async_hooks')

module.exports = new AsyncLocalStorage()
