const oracledb = require('oracledb');
require('dotenv').config();

// Force thick mode (nếu sử dụng Oracle Client)
oracledb.initOracleClient({ libDir: 'C:\\oracle\\instantclient-basiclite-windows\\instantclient_23_6' });



// Cấu hình cho BLOB
oracledb.fetchAsBuffer = [ oracledb.BLOB ];
oracledb.autoCommit = true;

// Tăng kích thước buffer cho BLOB
oracledb.maxRows = 100;
oracledb.fetchArraySize = 100;
oracledb.lobPrefetchSize = 16384; // 16KB

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectString: '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=192.84.100.205)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=live)))'
};

async function initialize() {
  try {
    await oracledb.createPool({
      ...dbConfig,
      poolMin: 2,
      poolMax: 5,
      poolIncrement: 1
    });
    console.log('Oracle database connection pool initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }
}

async function closePool() {
  try {
    await oracledb.getPool().close();
    console.log('Pool closed');
  } catch (err) {
    console.error('Error closing pool:', err);
    throw err;
  }
}

async function getConnection() {
  return await oracledb.getConnection();
}

module.exports = { initialize, closePool, getConnection };
