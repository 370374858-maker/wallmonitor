import { pool } from './db.js';

export async function listSlots() {
  const [rows] = await pool.query(
    'SELECT slot_code AS id, status, method, design_depth_m AS depth, updated_at AS updatedAt FROM slot ORDER BY slot_code'
  );
  return rows;
}

export async function getSlot(slotCode) {
  const [rows] = await pool.execute(
    'SELECT slot_code AS id, category, method AS type, design_depth_m AS depth, width_m AS width, thickness_m AS thickness, tremie_count AS tremieCount, joint_count AS jointCount, status, started_at AS start, updated_at AS updatedAt FROM slot WHERE slot_code = ?',
    [slotCode]
  );
  return rows[0] || null;
}

export async function getLatestPouring(slotCode) {
  const [rows] = await pool.execute(
    'SELECT truck_no AS truckNo, concrete_volume_m3 AS concreteVolume, current_height_m AS currentHeight, theoretical_height_m AS theoreticalHeight, theoretical_speed_mph AS speed, started_at AS startedAt, ended_at AS endedAt, actual_cumulative_volume_m3 AS cumulativeVolume FROM pouring_record WHERE slot_code = ? ORDER BY ended_at DESC, id DESC LIMIT 1',
    [slotCode]
  );
  return rows[0] || null;
}

export async function getLatestMeasurement(slotCode) {
  const [rows] = await pool.execute(
    'SELECT sequence_no AS sequenceNo, actual_height_m AS actualHeight, measured_at AS measuredAt, actual_speed_mph AS speed, theoretical_cumulative_volume_m3 AS theoreticalCumulativeVolume FROM measurement_record WHERE slot_code = ? ORDER BY measured_at DESC, id DESC LIMIT 1',
    [slotCode]
  );
  return rows[0] || null;
}

export async function getLatestTremie(slotCode) {
  const [rows] = await pool.execute(
    'SELECT sequence_no AS sequenceNo, pipe1_depth_m AS pipe1, pipe2_depth_m AS pipe2, pipe3_depth_m AS pipe3, pulled_at AS pulledAt FROM tremie_record WHERE slot_code = ? ORDER BY pulled_at DESC, id DESC LIMIT 1',
    [slotCode]
  );
  return rows[0] || null;
}

export async function getLatestJointPipe(slotCode) {
  const [rows] = await pool.execute(
    'SELECT sequence_no AS sequenceNo, pipe1_depth_m AS pipe1, pipe2_depth_m AS pipe2, pulled_at AS pulledAt FROM joint_pipe_record WHERE slot_code = ? ORDER BY pulled_at DESC, id DESC LIMIT 1',
    [slotCode]
  );
  return rows[0] || null;
}

export async function getLatestPressure(slotCode) {
  const [rows] = await pool.execute(
    'SELECT pressure_mpa AS value, measured_at AS measuredAt FROM pressure_reading WHERE slot_code = ? ORDER BY measured_at DESC, id DESC LIMIT 1',
    [slotCode]
  );
  return rows[0] || null;
}

export async function getLatestCuring(slotCode) {
  const [rows] = await pool.execute(
    'SELECT c.truck_no AS truckNo, c.sequence_no AS sequenceNo, c.rise_height_m AS riseHeight, c.recorded_at AS recordedAt, p.theoretical_height_m AS theoreticalHeight, p.current_height_m AS currentHeight FROM curing_progress c LEFT JOIN pouring_record p ON p.slot_code = c.slot_code AND p.truck_no = c.truck_no WHERE c.slot_code = ? AND c.initial_set_status = 1 ORDER BY c.recorded_at DESC, c.id DESC LIMIT 1',
    [slotCode]
  );
  return rows[0] || null;
}

export async function getPouringHistory(slotCode, limit = 24) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 24));
  const [rows] = await pool.execute(
    'SELECT truck_no AS truckNo, concrete_volume_m3 AS concreteVolume, current_height_m AS currentHeight, theoretical_height_m AS theoreticalHeight, theoretical_speed_mph AS speed, started_at AS startedAt, ended_at AS endedAt, actual_cumulative_volume_m3 AS cumulativeVolume FROM pouring_record WHERE slot_code = ? ORDER BY ended_at DESC, id DESC LIMIT ' + safeLimit,
    [slotCode]
  );
  return rows.reverse();
}

export async function getMeasurementHistory(slotCode, limit = 24) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 24));
  const [rows] = await pool.execute(
    'SELECT sequence_no AS sequenceNo, point1_m AS point1, point2_m AS point2, point3_m AS point3, point4_m AS point4, point5_m AS point5, point6_m AS point6, actual_height_m AS actualHeight, measured_at AS measuredAt, actual_speed_mph AS speed, theoretical_cumulative_volume_m3 AS theoreticalCumulativeVolume FROM measurement_record WHERE slot_code = ? ORDER BY measured_at DESC, id DESC LIMIT ' + safeLimit,
    [slotCode]
  );
  return rows.reverse();
}

export async function getPressureHistory(slotCode, limit = 24) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 24));
  const [rows] = await pool.execute(
    'SELECT pressure_mpa AS value, measured_at AS measuredAt FROM pressure_reading WHERE slot_code = ? ORDER BY measured_at DESC, id DESC LIMIT ' + safeLimit,
    [slotCode]
  );
  return rows.reverse();
}

export async function getAlerts({ slotCode, status, limit = 50 } = {}) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const conditions = [];
  const values = [];
  if (slotCode) {
    conditions.push('slot_code = ?');
    values.push(slotCode);
  }
  if (status) {
    conditions.push('status = ?');
    values.push(status);
  }
  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute(
    'SELECT id, slot_code AS slotId, severity AS level, category, message AS description, measured_value AS value, unit, status, occurred_at AS occurredAt, acknowledged_at AS acknowledgedAt FROM alert' + where + ' ORDER BY occurred_at DESC, id DESC LIMIT ' + safeLimit,
    values
  );
  return rows;
}

export async function updateSlot(slotCode, input) {
  const allowed = {
    category: 'category',
    type: 'method',
    depth: 'design_depth_m',
    width: 'width_m',
    thickness: 'thickness_m',
    tremieCount: 'tremie_count',
    jointCount: 'joint_count',
    status: 'status',
    start: 'started_at'
  };
  const entries = Object.entries(input).filter(([key]) => allowed[key]);
  if (!entries.length) return getSlot(slotCode);
  const setClause = entries.map(([key]) => allowed[key] + ' = ?').join(', ');
  const values = entries.map(([, value]) => value);
  values.push(slotCode);
  await pool.execute('UPDATE slot SET ' + setClause + ', updated_at = CURRENT_TIMESTAMP WHERE slot_code = ?', values);
  return getSlot(slotCode);
}

export async function insertRecord(table, slotCode, input) {
  const definitions = {
    pouring: {
      table: 'pouring_record',
      fields: ['truckNo','concreteVolume','currentHeight','theoreticalHeight','speed','startedAt','endedAt','cumulativeVolume'],
      columns: ['truck_no','concrete_volume_m3','current_height_m','theoretical_height_m','theoretical_speed_mph','started_at','ended_at','actual_cumulative_volume_m3']
    },
    measurement: {
      table: 'measurement_record',
      fields: ['sequenceNo','point1','point2','point3','point4','point5','point6','actualHeight','measuredAt','speed','theoreticalCumulativeVolume'],
      columns: ['sequence_no','point1_m','point2_m','point3_m','point4_m','point5_m','point6_m','actual_height_m','measured_at','actual_speed_mph','theoretical_cumulative_volume_m3']
    },
    tremie: {
      table: 'tremie_record',
      fields: ['sequenceNo','pipe1','pipe2','pipe3','pulledAt'],
      columns: ['sequence_no','pipe1_depth_m','pipe2_depth_m','pipe3_depth_m','pulled_at']
    },
    joint: {
      table: 'joint_pipe_record',
      fields: ['sequenceNo','pipe1','pipe2','pulledAt'],
      columns: ['sequence_no','pipe1_depth_m','pipe2_depth_m','pulled_at']
    },
    pressure: {
      table: 'pressure_reading',
      fields: ['value','measuredAt'],
      columns: ['pressure_mpa','measured_at']
    }
  };
  const definition = definitions[table];
  if (!definition) throw new Error('Unsupported record type');
  const missing = definition.fields.filter((field) => input[field] === undefined);
  if (missing.length) {
    const error = new Error('Missing fields: ' + missing.join(', '));
    error.status = 400;
    throw error;
  }
  const columns = ['slot_code', ...definition.columns];
  const values = [slotCode, ...definition.fields.map((field) => input[field])];
  const placeholders = columns.map(() => '?').join(', ');
  const [result] = await pool.execute(
    'INSERT INTO ' + definition.table + ' (' + columns.join(', ') + ') VALUES (' + placeholders + ')',
    values
  );
  return { id: result.insertId };
}

export async function acknowledgeAlert(id) {
  const [result] = await pool.execute(
    "UPDATE alert SET status = 'acknowledged', acknowledged_at = CURRENT_TIMESTAMP WHERE id = ?",
    [id]
  );
  return result.affectedRows > 0;
}
