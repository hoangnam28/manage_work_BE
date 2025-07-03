const express = require('express');
const router = express.Router();
const database = require('../config/database');      
const database2 = require('../config/database_2');
const oracledb = require('oracledb');

oracledb.fetchAsBuffer = [oracledb.BLOB];
oracledb.autoCommit = true;


router.get('/customers', async (req, res) => {
  let connection;
  try {
    connection = await database2.getConnection();
    const result = await connection.execute(
      `SELECT customer_part_number AS "Customer Part Number" FROM admin.data0050`
    );
    res.json(result.rows.map(row => ({
      customer_part_number: row['Customer Part Number']
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});


router.get('/list', async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT id,customer_code, type_board, size_normal, rate_normal, size_big, rate_big, request, confirm_by, note FROM large_size`
    );
    res.json(result.rows.map(row => ({
      id: row.ID,
      customer_code: row.CUSTOMER_CODE,
      type_board: row.TYPE_BOARD,
      size_normal: row.SIZE_NORMAL,
      rate_normal: row.RATE_NORMAL,
      size_big: row.SIZE_BIG,
      rate_big: row.RATE_BIG,
      request: row.REQUEST,
      confirm_by: row.CONFIRM_BY,
      note: row.NOTE
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});
router.post('/create', async (req, res) => {
  let connection;
  try {
    const {
      customer_part_number, 
      type_board,
      size_normal,
      rate_normal,
      size_big,
      rate_big,
      request,
      confirm_by,
      note
    } = req.body;

    if (!customer_part_number || !type_board) {
      return res.status(400).json({ error: 'customer_part_number và type_board là bắt buộc' });
    }

    connection = await database.getConnection();
    // Lấy id mới
    const idResult = await connection.execute(`SELECT large_size_seq.NEXTVAL as ID FROM DUAL`);
    const nextId = idResult.rows[0][0];

    await connection.execute(
      `INSERT INTO large_size (
        id, customer_code, type_board, size_normal, rate_normal, size_big, rate_big, request, confirm_by, note
      ) VALUES (
        :id, :customer_code, :type_board, :size_normal, :rate_normal, :size_big, :rate_big, :request, :confirm_by, :note
      )`,
      {
        id: nextId,
        customer_code: customer_part_number,
        type_board,
        size_normal,
        rate_normal,
        size_big,
        rate_big,
        request,
        confirm_by,
        note
      },
      { autoCommit: true }
    );
    res.status(201).json({ success: true, id: nextId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

module.exports = router;