const express = require('express');
const router = express.Router();
const database = require('../config/database');      
const database2 = require('../config/database_2');
const oracledb = require('oracledb');
const { sendMail } = require('../helper/sendMail');

oracledb.fetchAsBuffer = [oracledb.BLOB];
oracledb.autoCommit = true;


router.get('/customers', async (req, res) => {
  let connection;
  try {
    connection = await database2.getConnection();
    
    const result = await connection.execute(
      `SELECT DISTINCT TRIM(customer_part_number) as customer_part_number 
       FROM admin.data0050 
       WHERE customer_part_number IS NOT NULL 
       AND TRIM(customer_part_number) IS NOT NULL
       AND LENGTH(TRIM(customer_part_number)) > 0
       ORDER BY TRIM(customer_part_number)`,
      [],
      { 
        maxRows: 0,
        fetchArraySize: 2000,
        outFormat: oracledb.OUT_FORMAT_OBJECT
      }
    );
    
    console.log(`Total customers fetched: ${result.rows.length}`);
    
    const uniqueCustomers = [...new Set(
      result.rows
        .map(row => (row.CUSTOMER_PART_NUMBER || '').trim())
        .filter(customer => customer.length > 0)
    )];
    const customers = uniqueCustomers.map(customer => ({
      customer_part_number: customer
    }));
    
    res.json(customers);
  } catch (err) {
    console.error('Error fetching customers:', err);
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
      `SELECT id, customer_code, type_board, size_normal, rate_normal, size_big, rate_big, request, confirm_by, note FROM large_size`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});
router.post('/create', async (req, res) => {
  console.log('POST /large-size/create body:', req.body);
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

    // Gửi mail thông báo yêu cầu xác nhận
    const subject = `Yêu cầu xác nhận mã hàng mới: ${customer_part_number}`;
    const html = `
      <b>Mã sản phẩm:</b> ${customer_part_number}<br>
      <b>Loại bo:</b> ${type_board}<br>
      <b>Kích thước Tối ưu:</b> ${size_normal}<br>
      <b>Tỷ lệ % (Bo thường):</b> ${rate_normal}<br>
      <b>Kích thước bo to:</b> ${size_big}<br>
      <b>Tỷ lệ % (Bo to):</b> ${rate_big}<br>
      <b>Ghi chú:</b> ${note}<br>
      <b>Yêu cầu xác nhận sử dụng bo to!</b>
    `;
    sendMail(subject, html).catch(console.error);

    res.status(201).json({ success: true, id: nextId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});
router.put('/update/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const {
      confirm_by,
      request,
      type_board,
      size_normal,
      rate_normal,
      size_big,
      rate_big,
      note,
      customer_code
    } = req.body;

    connection = await database.getConnection();
    // Xây dựng câu lệnh update động
    const fields = [];
    const binds = { id };
    if (typeof confirm_by !== 'undefined') {
      fields.push('confirm_by = :confirm_by');
      binds.confirm_by = confirm_by;

      fields.push('request = :request');
      binds.request = 'TRUE';
    }
    if (typeof type_board !== 'undefined') {
      fields.push('type_board = :type_board');
      binds.type_board = type_board;
    }
    if (typeof size_normal !== 'undefined') {
      fields.push('size_normal = :size_normal');
      binds.size_normal = size_normal;
    }
    if (typeof rate_normal !== 'undefined') {
      fields.push('rate_normal = :rate_normal');
      binds.rate_normal = rate_normal;
    }
    if (typeof size_big !== 'undefined') {
      fields.push('size_big = :size_big');
      binds.size_big = size_big;
    }
    if (typeof rate_big !== 'undefined') {
      fields.push('rate_big = :rate_big');
      binds.rate_big = rate_big;
    }
    if (typeof note !== 'undefined') {
      fields.push('note = :note');
      binds.note = note;
    }
    if (typeof customer_code !== 'undefined') {
      fields.push('customer_code = :customer_code');
      binds.customer_code = customer_code;
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'Không có trường nào để cập nhật' });
    }
    const sql = `UPDATE large_size SET ${fields.join(', ')} WHERE id = :id`;
    await connection.execute(sql, binds, { autoCommit: true });

    // Nếu xác nhận (có confirm_by), gửi mail báo đã xác nhận
    if (typeof confirm_by !== 'undefined') {
      // Lấy lại thông tin mã hàng để gửi mail đầy đủ
      const result = await connection.execute(
        `SELECT customer_code, type_board, size_normal, rate_normal, size_big, rate_big, note FROM large_size WHERE id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const row = result.rows[0] || {};
      const subject = `Đã xác nhận mã hàng: ${row.CUSTOMER_CODE || customer_code || ''}`;
      const html = `
        <b>Mã sản phẩm:</b> ${row.CUSTOMER_CODE || customer_code || ''}<br>
        <b>Loại bo:</b> ${row.TYPE_BOARD || type_board || ''}<br>
        <b>Kích thước Tối ưu:</b> ${row.SIZE_NORMAL || size_normal || ''}<br>
        <b>Tỷ lệ % (Bo thường):</b> ${row.RATE_NORMAL || rate_normal || ''}<br>
        <b>Kích thước bo to:</b> ${row.SIZE_BIG || size_big || ''}<br>
        <b>Tỷ lệ % (Bo to):</b> ${row.RATE_BIG || rate_big || ''}<br>
        <b>Ghi chú:</b> ${row.NOTE || note || ''}<br>
        <b>Người xác nhận:</b> ${confirm_by}<br>
        <b>Thời gian:</b> ${new Date().toLocaleString()}<br>
        <b>Đã xác nhận sử dụng bo to!</b>
      `;
      sendMail(subject, html).catch(console.error);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

module.exports = router;