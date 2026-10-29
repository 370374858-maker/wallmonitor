
CREATE TABLE IF NOT EXISTS cw_slot (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slot_code VARCHAR(32) NOT NULL,
  request_key CHAR(36) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  width_m DECIMAL(12,4) NOT NULL,
  depth_m DECIMAL(12,4) NOT NULL,
  thickness_m DECIMAL(12,4) NOT NULL,
  tremie_count TINYINT UNSIGNED NOT NULL,
  joint_layout VARCHAR(8) NOT NULL,
  properties JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY cw_slot_code (slot_code),
  UNIQUE KEY cw_slot_request (request_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ;

CREATE TABLE IF NOT EXISTS cw_record (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slot_id CHAR(36) NOT NULL,
  request_key CHAR(36) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  truck_no INT UNSIGNED NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NOT NULL,
  volume_m3 DECIMAL(14,4) NOT NULL,
  point_1 DECIMAL(12,4) NOT NULL,
  point_2 DECIMAL(12,4) NOT NULL,
  point_3 DECIMAL(12,4) NOT NULL,
  point_4 DECIMAL(12,4) NOT NULL,
  point_5 DECIMAL(12,4) NOT NULL,
  point_6 DECIMAL(12,4) NOT NULL,
  tremie_pulls JSON NOT NULL,
  joint_pulls JSON NOT NULL,
  metrics JSON NOT NULL,
  slot_snapshot JSON NOT NULL,
  previous_record_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY cw_record_request (request_key),
  UNIQUE KEY cw_record_truck (slot_id, truck_no),
  KEY cw_record_time (slot_id, ended_at, id),
  CONSTRAINT cw_record_slot FOREIGN KEY (slot_id) REFERENCES cw_slot(id),
  CONSTRAINT cw_record_previous FOREIGN KEY (previous_record_id) REFERENCES cw_record(id),
  CONSTRAINT cw_record_duration CHECK (ended_at > started_at),
  CONSTRAINT cw_record_volume CHECK (volume_m3 > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ;


CREATE TABLE IF NOT EXISTS cw_revision (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slot_id CHAR(36) NOT NULL,
  request_key CHAR(36) NOT NULL UNIQUE,
  payload_hash CHAR(64) NOT NULL,
  kind VARCHAR(12) NOT NULL,
  target_id CHAR(36) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  base_revision BIGINT UNSIGNED NOT NULL,
  result JSON NOT NULL,
  slot_before JSON NOT NULL,
  slot_after JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_revision_slot (slot_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cw_revision_record (
  revision_id CHAR(36) NOT NULL,
  record_id CHAR(36) NOT NULL,
  before_data JSON NOT NULL,
  after_data JSON NOT NULL,
  PRIMARY KEY (revision_id, record_id),
  CONSTRAINT fk_revision_record_revision FOREIGN KEY (revision_id) REFERENCES cw_revision(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
