const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

oracledb.fetchAsBuffer = [oracledb.BLOB];
oracledb.autoCommit = true;


router.get('/list-impedance', async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT imp_id,
              imp_1, imp_2, imp_3, imp_4, imp_5, imp_6, imp_7, imp_8, imp_9,
              imp_10, imp_11, imp_12, imp_13, imp_14, imp_15, imp_16, imp_17,
              imp_18, imp_19, imp_20, imp_21, imp_22, imp_23, imp_24, imp_25, 
              imp_26, imp_27, imp_28, imp_29, imp_30, note
       FROM impedances`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error in /list-impedance route:', err);
    res.status(500).json({
      message: 'Lỗi server',
      error: err.message,
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
});
router.post('/create-impedance', async (req, res) => {
  const { imp_1, imp_2, imp_3, imp_4 } = req.body;
  let connection;

  try {
    connection = await database.getConnection();

    // Tự động tạo IMP_ID
    const idResult = await connection.execute(
      `SELECT NVL(MAX(TO_NUMBER(REPLACE(imp_id, 'IMP_ID_', ''))), 0) + 1 AS next_id
       FROM impedances
       WHERE REGEXP_LIKE(imp_id, '^IMP_ID_[0-9]+$')`
    );
    const nextId = idResult.rows[0].NEXT_ID;
    const impId = `IMP_ID_${nextId}`;

    // Thêm dữ liệu mới vào bảng
    await connection.execute(
      `INSERT INTO impedances (imp_id, imp_1, imp_2, imp_3, imp_4)
       VALUES (:imp_id, :imp_1, :imp_2, :imp_3, :imp_4)`,
      { imp_id: impId, imp_1, imp_2, imp_3, imp_4 }
    );

    await connection.commit();

    res.json({
      message: 'Thêm mới thành công',
      data: { imp_id: impId, imp_1, imp_2, imp_3, imp_4 },
    });
  } catch (err) {
    console.error('Error creating impedance:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
});
module.exports = router;