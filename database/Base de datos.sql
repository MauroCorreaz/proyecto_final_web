CREATE DATABASE IF NOT EXISTS reporte_danos
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE reporte_danos;

CREATE TABLE IF NOT EXISTS rooms (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  building VARCHAR(100) NOT NULL,
  room_number VARCHAR(20) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS equipment (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id INT UNSIGNED NOT NULL,
  code VARCHAR(30) NOT NULL UNIQUE,
  kind ENUM('computador', 'ventilador') NOT NULL DEFAULT 'computador',
  section_code CHAR(1) NOT NULL,
  position_number SMALLINT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_equipment_room FOREIGN KEY (room_id) REFERENCES rooms(id),
  INDEX idx_equipment_room (room_id, section_code, position_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  equipment_id INT UNSIGNED NOT NULL,
  category VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('pendiente', 'revision', 'resuelto') NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reports_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(id),
  INDEX idx_reports_equipment_created (equipment_id, created_at, id),
  INDEX idx_reports_status_created (status, created_at)
) ENGINE=InnoDB;

UPDATE rooms
SET is_active = 0
WHERE code NOT IN ('B205','B303','B304','B403','B404','C203','C303','C304','C403','C404');

INSERT INTO rooms (code, building, room_number, sort_order, is_active) VALUES
  ('B205', 'Torre B', '205', 1, 1),
  ('B303', 'Torre B', '303', 2, 1),
  ('B304', 'Torre B', '304', 3, 1),
  ('B403', 'Torre B', '403', 4, 1),
  ('B404', 'Torre B', '404', 5, 1),
  ('C203', 'Torre C', '203', 6, 1),
  ('C303', 'Torre C', '303', 7, 1),
  ('C304', 'Torre C', '304', 8, 1),
  ('C403', 'Torre C', '403', 9, 1),
  ('C404', 'Torre C', '404', 10, 1)
ON DUPLICATE KEY UPDATE
  building = VALUES(building),
  room_number = VALUES(room_number),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);