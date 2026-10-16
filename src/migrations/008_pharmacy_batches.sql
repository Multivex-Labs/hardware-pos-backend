-- Pharmacy batch inventory: additive, rerunnable migration.
CREATE TABLE IF NOT EXISTS inventory_batches (
  id INT NOT NULL AUTO_INCREMENT,
  product_id INT NOT NULL,
  batch_number VARCHAR(80) NOT NULL,
  supplier_id INT DEFAULT NULL,
  grn_id INT DEFAULT NULL,
  received_date DATE DEFAULT NULL,
  manufacture_date DATE DEFAULT NULL,
  expiry_date DATE DEFAULT NULL,
  quantity_received DECIMAL(12,3) NOT NULL DEFAULT 0,
  quantity_on_hand DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('active','quarantined','recalled','depleted') NOT NULL DEFAULT 'active',
  status_reason VARCHAR(255) DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_batch_product_number (product_id, batch_number),
  KEY idx_batch_fefo (product_id, status, expiry_date, id),
  KEY idx_batch_expiry_status (expiry_date, status),
  KEY idx_batch_supplier (supplier_id),
  CONSTRAINT inventory_batches_product_fk FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT inventory_batches_supplier_fk FOREIGN KEY (supplier_id) REFERENCES vendors(id) ON DELETE SET NULL,
  CONSTRAINT inventory_batches_grn_fk FOREIGN KEY (grn_id) REFERENCES goods_received(id) ON DELETE SET NULL,
  CONSTRAINT inventory_batches_user_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS batch_stock_movements (
  id BIGINT NOT NULL AUTO_INCREMENT,
  batch_id INT NOT NULL,
  product_id INT NOT NULL,
  movement_type ENUM('opening','purchase','sale','dispensing','adjustment','damage','quarantine','recall','status_change','void_reversal','return','write_off') NOT NULL,
  quantity_change DECIMAL(12,3) NOT NULL,
  quantity_before DECIMAL(12,3) NOT NULL,
  quantity_after DECIMAL(12,3) NOT NULL,
  reference_type VARCHAR(50) DEFAULT NULL,
  reference_id INT DEFAULT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  performed_by INT DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_batch_movement (batch_id, created_at),
  KEY idx_batch_movement_reference (reference_type, reference_id),
  CONSTRAINT batch_movements_batch_fk FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
  CONSTRAINT batch_movements_product_fk FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT batch_movements_user_fk FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sale_batch_allocations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  sale_item_id INT NOT NULL,
  sale_id INT NOT NULL,
  product_id INT NOT NULL,
  batch_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sale_allocation_item (sale_item_id),
  KEY idx_sale_allocation_batch (batch_id),
  CONSTRAINT sale_batch_alloc_item_fk FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
  CONSTRAINT sale_batch_alloc_sale_fk FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT sale_batch_alloc_product_fk FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT sale_batch_alloc_batch_fk FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS pharmacy_prescriptions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  prescription_number VARCHAR(80) DEFAULT NULL,
  patient_name VARCHAR(150) DEFAULT NULL,
  patient_reference VARCHAR(80) DEFAULT NULL,
  patient_contact VARCHAR(40) DEFAULT NULL,
  prescriber_name VARCHAR(150) DEFAULT NULL,
  prescription_date DATE DEFAULT NULL,
  status ENUM('pending','in_progress','partially_dispensed','dispensed','cancelled') NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pharmacy_prescription_number (prescription_number),
  KEY idx_prescription_status_date (status, prescription_date),
  CONSTRAINT pharmacy_prescriptions_user_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS pharmacy_prescription_items (
  id BIGINT NOT NULL AUTO_INCREMENT,
  prescription_id BIGINT NOT NULL,
  product_id INT NOT NULL,
  quantity_prescribed DECIMAL(12,3) NOT NULL,
  quantity_dispensed DECIMAL(12,3) NOT NULL DEFAULT 0,
  dosage_instructions VARCHAR(255) DEFAULT NULL,
  frequency VARCHAR(100) DEFAULT NULL,
  route VARCHAR(80) DEFAULT NULL,
  duration VARCHAR(80) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_prescription_item (prescription_id),
  CONSTRAINT pharmacy_prescription_item_header_fk FOREIGN KEY (prescription_id) REFERENCES pharmacy_prescriptions(id) ON DELETE CASCADE,
  CONSTRAINT pharmacy_prescription_item_product_fk FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS dispensing_batch_allocations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  dispensing_log_id INT NOT NULL,
  batch_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dispensing_alloc_log (dispensing_log_id),
  KEY idx_dispensing_alloc_batch (batch_id),
  CONSTRAINT dispensing_alloc_log_fk FOREIGN KEY (dispensing_log_id) REFERENCES dispensing_log(id) ON DELETE CASCADE,
  CONSTRAINT dispensing_alloc_batch_fk FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS pharmacy_idempotency_keys (
  operation VARCHAR(40) NOT NULL,
  request_key VARCHAR(100) NOT NULL,
  result_id BIGINT DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (operation, request_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS dispensing_prescription_links (
  id BIGINT NOT NULL AUTO_INCREMENT,
  dispensing_log_id INT NOT NULL,
  prescription_item_id BIGINT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dispensing_prescription_item (dispensing_log_id, prescription_item_id),
  KEY idx_dispensing_prescription_item (prescription_item_id),
  CONSTRAINT dispensing_prescription_link_log_fk FOREIGN KEY (dispensing_log_id) REFERENCES dispensing_log(id) ON DELETE CASCADE,
  CONSTRAINT dispensing_prescription_link_item_fk FOREIGN KEY (prescription_item_id) REFERENCES pharmacy_prescription_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Preserve current one-batch-per-product data as an opening batch.
INSERT INTO inventory_batches
  (product_id, batch_number, expiry_date, quantity_received, quantity_on_hand, unit_cost, status)
SELECT p.id, COALESCE(NULLIF(p.batch_number, ''), CONCAT('OPENING-', p.id)), p.expiry_date,
       GREATEST(COALESCE(p.stock, 0), 0), GREATEST(COALESCE(p.stock, 0), 0), COALESCE(p.cost_price, 0),
       IF(COALESCE(p.stock, 0) > 0, 'active', 'depleted')
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM inventory_batches b WHERE b.product_id = p.id);

INSERT INTO batch_stock_movements
  (batch_id, product_id, movement_type, quantity_change, quantity_before, quantity_after, reason)
SELECT b.id, b.product_id, 'opening', b.quantity_on_hand, 0, b.quantity_on_hand, 'Migrated from existing product stock'
FROM inventory_batches b
WHERE NOT EXISTS (SELECT 1 FROM batch_stock_movements m WHERE m.batch_id = b.id);
