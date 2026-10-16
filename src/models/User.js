const db = require('../config/database')
const bcrypt = require('bcryptjs')
const { DEFAULT_PERMISSIONS, resolvePermissions } = require('../utils/permissions')

async function permissionsFor(role, storedPermissions) {
  if (storedPermissions) return resolvePermissions(storedPermissions, role)
  const [rows] = await db.execute('SELECT permissions FROM user_roles WHERE name = ? LIMIT 1', [role])
  return rows[0]
    ? resolvePermissions(rows[0].permissions, role)
    : resolvePermissions(null, role)
}

const User = {
  // Pata user kwa email
  async findByEmail(email) {
    const [rows] = await db.execute(
      'SELECT * FROM users WHERE email = ?', 
      [email]
    )
    if (!rows[0]) return undefined
    return { ...rows[0], permissions: await permissionsFor(rows[0].role, rows[0].permissions) }
  },

  // Unda user mpya
  async create(name, email, password, role = 'cashier') {
    const hashedPassword = await bcrypt.hash(password, 10)
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role, must_change_password) VALUES (?, ?, ?, ?, 1)',
      [name, email, hashedPassword, role]
    )
    return result.insertId
  },

  // Pata user kwa id
  async findById(id) {
    const [rows] = await db.execute(
      'SELECT id, name, email, role, permissions, must_change_password, created_at FROM users WHERE id = ?',
      [id]
    )
    if (!rows[0]) return undefined
    return { ...rows[0], permissions: await permissionsFor(rows[0].role, rows[0].permissions) }
  },

  async findPasswordById(id) {
    const [rows] = await db.execute('SELECT password FROM users WHERE id = ? LIMIT 1', [id])
    return rows[0]?.password
  },

  async updatePassword(id, passwordHash, mustChangePassword = false) {
    const [result] = await db.execute(
      'UPDATE users SET password = ?, must_change_password = ? WHERE id = ?',
      [passwordHash, mustChangePassword ? 1 : 0, id]
    )
    return result.affectedRows > 0
  },

  async setMustChangePassword(id) {
    const [result] = await db.execute(
      'UPDATE users SET must_change_password = 1 WHERE id = ?',
      [id]
    )
    return result.affectedRows > 0
  },

  // Pata users wote (bila password)
  async findAll() {
    const [rows] = await db.execute(
      'SELECT id, name, email, role, permissions, created_at FROM users ORDER BY created_at DESC'
    )
    return Promise.all(rows.map(async user => ({
      ...user,
      permissions: await permissionsFor(user.role, user.permissions)
    })))
  },

  async findRoles() {
    const [rows] = await db.execute('SELECT name, permissions FROM user_roles ORDER BY name')
    const overrides = new Map(rows.map(role => [role.name, role.permissions]))
    const builtins = ['admin', 'manager', 'cashier'].map(name => ({
      name,
      permissions: resolvePermissions(overrides.get(name), name),
      system: true
    }))
    return [...builtins, ...rows.filter(role => !DEFAULT_PERMISSIONS[role.name]).map(role => ({
      ...role,
      permissions: resolvePermissions(role.permissions, role.name),
      system: false
    }))]
  },

  async findRole(name) {
    if (DEFAULT_PERMISSIONS[name]) {
      const roles = await this.findRoles()
      return roles.find(role => role.name === name)
    }
    const [rows] = await db.execute('SELECT name, permissions FROM user_roles WHERE name = ? LIMIT 1', [name])
    return rows[0]
      ? { ...rows[0], permissions: resolvePermissions(rows[0].permissions, rows[0].name), system: false }
      : undefined
  },

  async createRole(name, permissions) {
    await db.execute(
      'INSERT INTO user_roles (name, permissions) VALUES (?, ?)',
      [name, JSON.stringify(permissions)]
    )
  },

  async updateRole(name, permissions) {
    if (name === 'admin') return false
    if (name === 'manager' || name === 'cashier') {
      const [result] = await db.execute(
        `INSERT INTO user_roles (name, permissions) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE permissions = VALUES(permissions)`,
        [name, JSON.stringify(permissions)]
      )
      return result.affectedRows > 0
    }
    const [result] = await db.execute(
      'UPDATE user_roles SET permissions = ? WHERE name = ?',
      [JSON.stringify(permissions), name]
    )
    return result.affectedRows > 0
  },

  async deleteRole(name) {
    const [users] = await db.execute('SELECT COUNT(*) AS count FROM users WHERE role = ?', [name])
    if (Number(users[0].count) > 0) return false
    const [result] = await db.execute('DELETE FROM user_roles WHERE name = ?', [name])
    return result.affectedRows > 0
  },

  async roleExists(name) {
    if (DEFAULT_PERMISSIONS[name]) return true
    const [rows] = await db.execute('SELECT 1 FROM user_roles WHERE name = ? LIMIT 1', [name])
    return rows.length > 0
  },

  async updateRoleForUser(id, role) {
    const [result] = await db.execute(
      'UPDATE users SET role = ?, permissions = NULL WHERE id = ?',
      [role, id]
    )
    return result.affectedRows > 0
  },

  // Futa user
  async delete(id) {
    const [result] = await db.execute(
      'DELETE FROM users WHERE id = ?',
      [id]
    )
    return result.affectedRows > 0
  },

  // Hesabu jumla ya admins (kuzuia kufuta admin wa mwisho)
  async countAdmins() {
    const [rows] = await db.execute(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'"
    )
    return rows[0].count
  }
}

module.exports = User
