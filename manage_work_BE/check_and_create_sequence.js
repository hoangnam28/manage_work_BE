const database = require('./src/config/database');
const oracledb = require('oracledb');

async function checkAndCreateSequence() {
  let connection;
  try {
    console.log('Checking for large_size_history_seq sequence...');
    connection = await database.getConnection();
    
    // Kiểm tra sequence có tồn tại không
    const checkResult = await connection.execute(
      `SELECT SEQUENCE_NAME FROM USER_SEQUENCES WHERE SEQUENCE_NAME = 'LARGE_SIZE_HISTORY_SEQ'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    if (checkResult.rows.length === 0) {
      console.log('Sequence does not exist. Creating large_size_history_seq...');
      
      // Tạo sequence
      await connection.execute(
        `CREATE SEQUENCE large_size_history_seq
         START WITH 1
         INCREMENT BY 1
         NOCACHE
         NOCYCLE`
      );
      
      // Cấp quyền
      await connection.execute(
        `GRANT SELECT ON large_size_history_seq TO PUBLIC`
      );
      
      console.log('Sequence large_size_history_seq created successfully!');
    } else {
      console.log('Sequence large_size_history_seq already exists.');
    }
    
  } catch (error) {
    console.error('Error checking/creating sequence:', error);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
}

// Chạy script
checkAndCreateSequence().then(() => {
  console.log('Sequence check completed.');
  process.exit(0);
}).catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
}); 