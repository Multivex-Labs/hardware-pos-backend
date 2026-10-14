-- STOCK CONVERSIONS — Multivex Labs POS
-- Kwa ajili ya "kufungua" bidhaa moja kubwa (mfano Cement - Bag) na kuibadilisha
-- kuwa stock ya bidhaa nyingine ndogo (mfano Cement - KG). Bidhaa MBILI hizi ni
-- products TOFAUTI kabisa kwenye database (sio unit ya product moja).

CREATE TABLE IF NOT EXISTS stock_conversions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_product_id INT NOT NULL,      -- bidhaa inayopungua (mfano Cement - Bag)
  from_quantity DECIMAL(12,3) NOT NULL,
  to_product_id INT NOT NULL,        -- bidhaa inayoongezeka (mfano Cement - KG)
  to_quantity DECIMAL(12,3) NOT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  performed_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (from_product_id) REFERENCES products(id),
  FOREIGN KEY (to_product_id) REFERENCES products(id),
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_from (from_product_id),
  INDEX idx_to (to_product_id)
) ENGINE=InnoDB;
