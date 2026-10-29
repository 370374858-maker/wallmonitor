import mysql from 'mysql2/promise';
import {writeFile} from 'node:fs/promises';

                                                                             
let raw = '';
for await (const part of process.stdin) { raw += part; if (raw.length > 65536) throw new Error('Input too large'); }
const input = JSON.parse(raw.replace(/^\uFEFF/, ''));
raw = '';
const db = await mysql.createConnection({host: input.host || '127.0.0.1', port: Number(input.port || 3306), user: input.user, password: input.password, connectTimeout: 8000, multipleStatements: false, supportBigNumbers: true, bigNumberStrings: true});
input.password = undefined;
try {
  const [[server]] = await db.query('SELECT VERSION() AS version, @@version_comment AS product, @@session.time_zone AS sessionTimeZone, @@system_time_zone AS systemTimeZone, NOW() AS serverTime');
  const [schemas] = await db.query("SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN ('mysql','information_schema','performance_schema','sys') ORDER BY SCHEMA_NAME LIMIT 201");
  const schema = input.database || null;
  if (schema && !schemas.some(item => item.name === schema)) throw new Error('所填数据库不可见；请核对库名和只读权限');
  const scope = schema ? 't.TABLE_SCHEMA = ?' : "t.TABLE_SCHEMA NOT IN ('mysql','information_schema','performance_schema','sys')";
  const args = schema ? [schema] : [];
  const [tables] = await db.execute(`SELECT t.TABLE_SCHEMA AS db, t.TABLE_NAME AS name, t.TABLE_TYPE AS kind, t.ENGINE AS engine FROM information_schema.TABLES t WHERE ${scope} ORDER BY t.TABLE_SCHEMA,t.TABLE_NAME LIMIT 1001`, args);
  const [columns] = await db.execute(`SELECT c.TABLE_SCHEMA AS db,c.TABLE_NAME AS tableName,c.COLUMN_NAME AS name,c.COLUMN_TYPE AS type,c.IS_NULLABLE AS nullable,c.COLUMN_KEY AS keyType,c.EXTRA AS extra FROM information_schema.COLUMNS c JOIN information_schema.TABLES t ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME WHERE ${scope} ORDER BY c.TABLE_SCHEMA,c.TABLE_NAME,c.ORDINAL_POSITION LIMIT 10001`, args);
  const [indexes] = await db.execute(`SELECT i.TABLE_SCHEMA AS db,i.TABLE_NAME AS tableName,i.INDEX_NAME AS name,i.NON_UNIQUE AS nonUnique,i.SEQ_IN_INDEX AS position,i.COLUMN_NAME AS columnName FROM information_schema.STATISTICS i JOIN information_schema.TABLES t ON t.TABLE_SCHEMA=i.TABLE_SCHEMA AND t.TABLE_NAME=i.TABLE_NAME WHERE ${scope} ORDER BY i.TABLE_SCHEMA,i.TABLE_NAME,i.INDEX_NAME,i.SEQ_IN_INDEX LIMIT 10001`, args);
  const candidates = columns.filter(c => /混凝土|面深|测深|压力|起拔|接头|拔管|采集|时间|depth|pressure|pull|concrete|payload|json|mqtt|timestamp|collect|DA[12]|^R(?:1|2|3|16|17|18|30|32)$/i.test(c.name));
  const report = {format: 1, collectedAt: new Date().toISOString(), metadataOnly: true, businessRowsRead: 0, databaseWrites: 0, server, selectedDatabase: schema, schemas: schemas.slice(0,200), tables: tables.slice(0,1000), columns: columns.slice(0,10000), indexes: indexes.slice(0,10000), candidates, truncated: schemas.length>200 || tables.length>1000 || columns.length>10000 || indexes.length>10000, limitation: '仅为该只读账号可见范围；无候选字段不代表数据库没有数据；不读取列注释、业务行或数据库密码'};
  if (!input.output) throw new Error('Missing output path');
  await writeFile(input.output, JSON.stringify(report, null, 2), {flag: 'wx'});
  console.log(JSON.stringify({ok: true, metadataOnly: true, tables: report.tables.length, columns: report.columns.length, truncated: report.truncated}));
} finally { await db.end(); }
