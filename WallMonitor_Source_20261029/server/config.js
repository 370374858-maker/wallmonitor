import 'dotenv/config';

function numberFromEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = Object.freeze({
  host: process.env.HOST || '127.0.0.1',
  port: numberFromEnv('PORT', 4173),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: numberFromEnv('DB_PORT', 3306),
    user: process.env.DB_USER || 'wall_monitor_app',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'diaphragm_wall_monitor',
    connectionLimit: numberFromEnv('DB_CONNECTION_LIMIT', 10)
  }
});
