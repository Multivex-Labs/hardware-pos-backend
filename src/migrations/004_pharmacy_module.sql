-- PHARMACY MODULE — Multivex Labs POS
-- ============================================================

-- 1. Pharmacy-specific fields on products (nullable — hardware clients leave these blank)
ALTER TABLE products
  ADD COLUMN expiry_date DATE NULL,
  ADD COLUMN batch_number VARCHAR(50) NULL,
  ADD COLUMN requires_prescription BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN dosage VARCHAR(200) NULL,
  ADD COLUMN manufacturer VARCHAR(150) NULL,
  ADD COLUMN drug_category ENUM('otc','prescription','controlled','supplement') NULL;

-- 2. Business type toggle — controls whether pharmacy fields/pages show in the UI
ALTER TABLE business_settings
  ADD COLUMN business_type ENUM('hardware','pharmacy','general') NOT NULL DEFAULT 'general';

-- 3. Allow stock_movements to record dispensing events (new ENUM value)
ALTER TABLE stock_movements
  MODIFY COLUMN movement_type ENUM(
    'sale','purchase','return','adjustment','damage',
    'transfer_in','transfer_out','void_reversal','dispensing'
  ) NOT NULL;

-- 4. Dispensing Register — basic PPB compliance log
-- NOTE: batch_number here is a SNAPSHOT copied from products.batch_number at the
-- time of dispensing (single-batch-per-product model, as agreed). If a product
-- carries multiple batches with different expiry dates at once, that needs a
-- separate "batches" table — a bigger feature for later if it becomes necessary.
CREATE TABLE IF NOT EXISTS dispensing_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  batch_number VARCHAR(50) DEFAULT NULL,
  quantity_dispensed INT NOT NULL,
  patient_name VARCHAR(150) DEFAULT NULL,
  prescriber_name VARCHAR(150) DEFAULT NULL,
  dosage_instructions VARCHAR(255) DEFAULT NULL,
  dispensed_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (dispensed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_product (product_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;
