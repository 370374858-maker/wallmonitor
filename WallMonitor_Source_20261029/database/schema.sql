

CREATE TABLE IF NOT EXISTS project (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_code VARCHAR(32) NOT NULL,
  project_name VARCHAR(120) NOT NULL,
  location VARCHAR(160) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_code (project_code)
) ENGINE=InnoDB ;

CREATE TABLE IF NOT EXISTS slot (
  slot_code VARCHAR(32) NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT '标准槽段',
  method ENUM('单管法','双管法','三管法') NOT NULL DEFAULT '三管法',
  design_depth_m DECIMAL(8,3) NOT NULL,
  width_m DECIMAL(8,3) NOT NULL,
  thickness_m DECIMAL(8,3) NOT NULL,
  tremie_count TINYINT UNSIGNED NOT NULL DEFAULT 3,
  joint_count TINYINT UNSIGNED NOT NULL DEFAULT 2,
  status ENUM('待施工','浇筑中','重点关注','已完成','已停工') NOT NULL DEFAULT '待施工',
  started_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (slot_code),
  KEY idx_slot_project (project_id),
  CONSTRAINT fk_slot_project FOREIGN KEY (project_id) REFERENCES project(id)
) ENGINE=InnoDB ;

CREATE TABLE IF NOT EXISTS pouring_record (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slot_code VARCHAR(32) NOT NULL,
  truck_no INT UNSIGNED NOT NULL,
  concrete_volume_m3 DECIMAL(10,3) NOT NULL,
  current_height_m DECIMAL(8,3) NOT NULL,
  theoretical_height_m DECIMAL(8,3) NOT NULL,
  theoretical_speed_mph DECIMAL(8,3) NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NOT NULL,
  actual_cumulative_volume_m3 DECIMAL(12,3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pouring_slot_truck (slot_code, truck_no),
  KEY idx_pouring_slot_time (slot_code, ended_at),
  CONSTRAINT fk_pouring_slot FOREIGN KEY (slot_code) REFERENCES slot(slot_code)
) ENGINE=InnoDB ;

CREATE TABLE IF NOT EXISTS measurement_record (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slot_code VARCHAR(32) NOT NULL,
  sequence_no INT UNSIGNED NOT NULL,
  point1_m DECIMAL(8,3) NULL,
  point2_m DECIMAL(8,3) NULL,
  point3_m DECIMAL(8,3) NULL,
  point4_m DECIMAL(8,3) NULL,
  point5_m DECIMAL(8,3) NULL,
  point6_m DECIMAL(8,3) NULL,
  actual_height_m DECIMAL(8,3) NOT NULL,
  measured_at DATETIME NOT NULL,
  actual_speed_mph DECIMAL(8,3) NOT NULL,
  theoretical_cumulative_volume_m3 DECIMAL(12,3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_measurement_slot_sequence (slot_code, sequence_no),
  KEY idx_measurement_slot_time (slot_code, measured_at),
  CONSTRAINT fk_measurement_slot FOREIGN KEY (slot_code) REFERENCES slot(slot_code)
) ENGINE=InnoDB ;

CREATE TABLE IF NOT EXISTS tremie_record (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slot_code VARCHAR(32) NOT NULL,
  sequence_no INT UNSIGNED NOT NULL,
  pipe1_depth_m DECIMAL(8,3) NULL,
  pipe2_depth_m DECIMAL(8,3) NULL,
  pipe3_depth_m DECIMAL(8,3) NULL,
  pulled_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tremie_slot_sequence (slot_code, sequence_no),
  KEY idx_tremie_slot_time (slot_code, pulled_at),
  CONSTRAINT fk_tremie_slot FOREIGN KEY (slot_code) REFERENCES slot(slot_code)
) ENGINE=InnoDB ;

CREATE TABLE IF NOT EXISTS joint_pipe_record (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slot_code VARCHAR(32) NOT NULL,
  sequence_no INT UNSIGNED NOT NULL,
  pipe1_depth_m DECIMAL(8,3) NULL,
  pipe2_depth_m DECIMAL(8,3) NULL,
  pulled_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_joint_slot_sequence (slot_code, sequence_no),
  KEY idx_joint_slot_time (slot_code, pulled_at),
  CONSTRAINT fk_joint_slot FOREIGN KEY (slot_code) REFERENCES slot(slot_code)
) ENGINE=InnoDB ;

CREATE TABLE IF NOT EXISTS pressure_reading (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slot_code VARCHAR(32) NOT NULL,
  pressure_mpa DECIMAL(8,4) NOT NULL,
  measured_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pressure_slot_time (slot_code, measured_at),
  KEY idx_pressure_slot_time (slot_code, measured_at),
  CONSTRAINT fk_pressure_slot FOREIGN KEY (slot_code) REFERENCES slot(slot_code)
) ENGINE=InnoDB ;

CREATE TABLE IF NOT EXISTS curing_progress (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slot_code VARCHAR(32) NOT NULL,
  truck_no INT UNSIGNED NOT NULL,
  sequence_no INT UNSIGNED NOT NULL,
  rise_height_m DECIMAL(8,3) NOT NULL,
  initial_set_status TINYINT(1) NOT NULL DEFAULT 0,
  recorded_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_curing_slot_truck_sequence (slot_code, truck_no, sequence_no),
  KEY idx_curing_slot_time (slot_code, recorded_at),
  CONSTRAINT fk_curing_slot FOREIGN KEY (slot_code) REFERENCES slot(slot_code)
) ENGINE=InnoDB ;

CREATE TABLE IF NOT EXISTS alert (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slot_code VARCHAR(32) NOT NULL,
  source_key VARCHAR(80) NOT NULL,
  severity ENUM('info','ok','warn','danger') NOT NULL,
  category VARCHAR(40) NOT NULL,
  message VARCHAR(255) NOT NULL,
  measured_value DECIMAL(12,4) NULL,
  unit VARCHAR(20) NULL,
  status ENUM('open','acknowledged','closed') NOT NULL DEFAULT 'open',
  occurred_at DATETIME NOT NULL,
  acknowledged_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alert_source (slot_code, source_key),
  KEY idx_alert_slot_status_time (slot_code, status, occurred_at),
  CONSTRAINT fk_alert_slot FOREIGN KEY (slot_code) REFERENCES slot(slot_code)
) ENGINE=InnoDB ;

CREATE TABLE IF NOT EXISTS system_setting (
  setting_key VARCHAR(80) NOT NULL,
  setting_value JSON NOT NULL,
  description VARCHAR(255) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB ;

INSERT INTO system_setting (setting_key, setting_value, description)
VALUES (
  'safety_rules_v1',
  JSON_OBJECT(
    'fillCoefficient', JSON_OBJECT('min', 1.0, 'max', 1.2),
    'tremieEmbedment', JSON_OBJECT('normalMin', 2.0, 'normalMax', 6.0, 'watchMin', 1.0, 'watchMax', 10.0),
    'jointClearance', JSON_OBJECT('minExclusive', 0.0, 'max', 0.5),
    'pouringSpeed', JSON_OBJECT('dangerBelow', 2.0, 'watchBelow', 3.0)
  ),
  '从旧 Unity 系统迁移并经服务端测试固化的第一版安全规则'
)
ON DUPLICATE KEY UPDATE
  setting_value = VALUES(setting_value),
  description = VALUES(description);
