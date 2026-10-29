import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {config} from '../server/config.js';

const name = config.db.database;
if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) throw new Error('Invalid DB_NAME');
const connection = await mysql.createConnection({
  host: config.db.host,
  port: config.db.port,
  user: process.env.DB_ADMIN_USER || config.db.user,
  password: process.env.DB_ADMIN_PASSWORD ?? config.db.password,
  multipleStatements: true,
  charset: 'utf8mb4',
});
try {
  await connection.query('CREATE DATABASE IF NOT EXISTS `' + name + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  await connection.query('USE `' + name + '`');
  for (const file of ['schema.sql', 'workbench.sql', 'events.sql', 'telemetry.sql']) {
    await connection.query(await readFile(new URL('../database/' + file, import.meta.url), 'utf8'));
  }
  const [tables] = await connection.query('SHOW TABLES');
  console.log(JSON.stringify({database: name, tables: tables.length, initialized: true}));
} finally {
  await connection.end();
}
