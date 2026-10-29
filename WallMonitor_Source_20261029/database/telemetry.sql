
CREATE TABLE IF NOT EXISTS bridge_binding (
  id char(36) NOT NULL PRIMARY KEY,
  collector_id varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  slot_id char(36) NOT NULL,
  project_no varchar(16) CHARACTER SET ascii NOT NULL,
  machine_no varchar(16) CHARACTER SET ascii NOT NULL,
  mode varchar(12) NOT NULL DEFAULT 'preview',
  config json NOT NULL,
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_bridge_slot FOREIGN KEY (slot_id) REFERENCES cw_slot(id),
  CONSTRAINT ck_bridge_mode CHECK (mode IN ('preview','paused'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_sample (
  id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  binding_id char(36) NOT NULL,
  slot_id char(36) NOT NULL,
  collector_id varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  stream varchar(3) CHARACTER SET ascii NOT NULL,
  source_table varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_id varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_timestamp varchar(32) CHARACTER SET ascii DEFAULT NULL,
  source_received_at datetime DEFAULT NULL,
  payload_hash char(64) CHARACTER SET ascii NOT NULL,
  raw_values json NOT NULL,
  received_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sample_source (collector_id,source_table,source_id),
  KEY ix_sample_latest (slot_id,stream,id),
  KEY ix_sample_source_time (slot_id,stream,source_received_at,id),
  KEY ix_collector_latest (collector_id,stream,source_received_at,id),
  CONSTRAINT fk_sample_binding FOREIGN KEY (binding_id) REFERENCES bridge_binding(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bridge_cursor (
  collector_id varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_table varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  lane varchar(12) CHARACTER SET ascii NOT NULL,
  lower_bound_id varchar(64) CHARACTER SET ascii NOT NULL DEFAULT '0',
  last_source_id varchar(64) CHARACTER SET ascii NOT NULL DEFAULT '0',
  updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (collector_id,source_table,lane),
  CONSTRAINT ck_bridge_lane CHECK (lane IN ('forward','reconcile'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bridge_batch (
  collector_id varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id char(36) CHARACTER SET ascii NOT NULL,
  payload_hash char(64) CHARACTER SET ascii NOT NULL,
  result json NOT NULL,
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (collector_id,request_id),
  KEY ix_bridge_batch_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
