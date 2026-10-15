# Sheria za AI kwenye repo hii (Multivex Labs POS)

## Architecture (usivunje)
- Multi-tenant: kila duka lina database yake. `req.tenant` inawekwa na middleware/tenant.js.
- JWT: tumia `signToken` / `verifyToken` kutoka `utils/tenantJwt.js` PEKEE.
  Kamwe usiite `jwt.sign` / `jwt.verify` moja kwa moja, kamwe usitumie secret ya .env kwa mode ya multi-tenant.
- Queries: tumia `db.execute()`; config ni `database.js` (si `db.js`). Usikwepe tenant-aware connection.
- Route files ni singular bila suffix ya "Routes". Auth: `auth` na `requireRole` kutoka `middleware/auth.js`.

## Usalama
- Usiweke secrets kwenye code au chat. Tumia majina ya env variables tu.
- Hakuna jina la mteja yeyote halisi ndani ya code au UI.

## Mtindo wa kazi
- Toa file kamili, si vipande. UI text ni English tu.
- Schema changes: andika migration mpya NA usasishe `sql/tenant_template.sql`.
- Kabla ya kuhariri file kubwa: commit kwanza. Usihariri file ambayo AI/mtu mwingine anaihariri sasa.
