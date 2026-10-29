
CREATE TABLE IF NOT EXISTS cw_event (
  id VARCHAR(128) NOT NULL,
  version INT UNSIGNED NOT NULL,
  slot_id CHAR(36) NOT NULL,
  type VARCHAR(16) NOT NULL,
  occurred_at DATETIME NOT NULL,
  received_at DATETIME(3) NOT NULL,
  source VARCHAR(16) NOT NULL,
  device_id VARCHAR(128) NULL,
  external_id VARCHAR(128) NULL,
  batch_id VARCHAR(128) NOT NULL,
  legacy_record_id CHAR(36) NULL,
  status VARCHAR(8) NOT NULL,
  payload JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id, version),
  KEY ix_cw_event_slot_time (slot_id, occurred_at, id, version),
  KEY ix_cw_event_legacy (legacy_record_id),
  CONSTRAINT fk_cw_event_slot FOREIGN KEY (slot_id) REFERENCES cw_slot(id),
  CONSTRAINT ck_cw_event_type CHECK (type IN ('pouring','measurement','tremie','joint')),
  CONSTRAINT ck_cw_event_source CHECK (source IN ('manual','device','legacy')),
  CONSTRAINT ck_cw_event_status CHECK (status IN ('active','void'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cw_event_request (
  request_key VARCHAR(128) NOT NULL PRIMARY KEY,
  slot_id CHAR(36) NOT NULL,
  operation VARCHAR(16) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  result JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_cw_event_request_slot (slot_id, created_at),
  CONSTRAINT fk_cw_event_request_slot FOREIGN KEY (slot_id) REFERENCES cw_slot(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cw_device_event_request (
  device_id VARCHAR(128) NOT NULL,
  external_id VARCHAR(128) NOT NULL,
  slot_id CHAR(36) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  event_id VARCHAR(128) NOT NULL,
  event_version INT UNSIGNED NOT NULL,
  result JSON NOT NULL,
  received_at DATETIME(3) NOT NULL,
  PRIMARY KEY (device_id, external_id),
  KEY ix_cw_device_slot (slot_id, received_at),
  CONSTRAINT fk_cw_device_slot FOREIGN KEY (slot_id) REFERENCES cw_slot(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cw_event_audit (
  id CHAR(36) NOT NULL PRIMARY KEY,
  request_key VARCHAR(128) NOT NULL,
  slot_id CHAR(36) NOT NULL,
  event_id VARCHAR(128) NOT NULL,
  before_version INT UNSIGNED NULL,
  after_version INT UNSIGNED NOT NULL,
  reason VARCHAR(500) NULL,
  before_data JSON NULL,
  after_data JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_cw_event_audit_event (slot_id, event_id, created_at),
  CONSTRAINT fk_cw_event_audit_slot FOREIGN KEY (slot_id) REFERENCES cw_slot(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
