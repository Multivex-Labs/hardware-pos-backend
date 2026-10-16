CREATE TABLE IF NOT EXISTS platform_customers (
  id INT NOT NULL AUTO_INCREMENT,
  tenant_id INT NULL,
  customer_type ENUM('local', 'one_time') NOT NULL DEFAULT 'local',
  business_name VARCHAR(160) NOT NULL,
  contact_name VARCHAR(120) NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(40) NOT NULL,
  package_name VARCHAR(120) NULL,
  notes TEXT NULL,
  status ENUM('active', 'prospect', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY platform_customers_tenant_unique (tenant_id),
  KEY platform_customers_name_idx (business_name),
  KEY platform_customers_phone_idx (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_payments (
  id INT NOT NULL AUTO_INCREMENT,
  customer_id INT NOT NULL,
  amount_tzs DECIMAL(14,2) NOT NULL,
  reference VARCHAR(120) NULL,
  note VARCHAR(500) NULL,
  paid_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY platform_payments_customer_date_idx (customer_id, paid_at),
  CONSTRAINT platform_payments_customer_fk
    FOREIGN KEY (customer_id) REFERENCES platform_customers (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_documents (
  id INT NOT NULL AUTO_INCREMENT,
  category ENUM('invoice_template', 'pos_contract') NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_name VARCHAR(80) NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  uploaded_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY platform_documents_storage_unique (storage_name),
  KEY platform_documents_category_idx (category, uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
