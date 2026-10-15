CREATE TABLE IF NOT EXISTS user_roles (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(40) NOT NULL,
  permissions LONGTEXT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY user_roles_name_unique (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  MODIFY COLUMN role VARCHAR(100) NOT NULL DEFAULT 'cashier';

INSERT INTO user_roles (name, permissions)
SELECT CONCAT('Custom ', role, ' ', id), permissions
FROM users
WHERE permissions IS NOT NULL AND role <> 'admin'
ON DUPLICATE KEY UPDATE permissions = VALUES(permissions);

UPDATE users
SET role = CONCAT('Custom ', role, ' ', id), permissions = NULL
WHERE permissions IS NOT NULL AND role <> 'admin';

UPDATE users SET permissions = NULL WHERE role = 'admin';
