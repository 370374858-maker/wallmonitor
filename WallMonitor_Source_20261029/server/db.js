import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: true,
  charset: 'utf8mb4'
});

export async function checkDatabase() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query('SELECT VERSION() AS version, DATABASE() AS db');
    return rows[0];
  } finally {
    connection.release();
  }
}

export async function inTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
