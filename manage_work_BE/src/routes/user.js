const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Middleware xác thực token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token không hợp lệ' });
    }
    req.user = user;
    next();
  });
};

// Middleware kiểm tra quyền admin
const checkAdminPermission = async (req, res, next) => {
  let connection;
  try {
    connection = await database.getConnection();
    // Since there's no IS_ADMIN column, we'll use a specific COMPANY_ID or other logic to determine admin
    const result = await connection.execute(
      `SELECT COMPANY_ID FROM users WHERE COMPANY_ID = :company_id`,
      { company_id: req.user.company_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // You might want to define specific COMPANY_IDs that have admin access
    const adminCompanyIds = ['000001'];
    if (result.rows.length === 0 || !adminCompanyIds.includes(result.rows[0].COMPANY_ID)) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập trang này' });
    }
    next();
  } catch (error) {
    console.error('Error checking admin permission:', error);
    res.status(500).json({ message: 'Lỗi server' });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
};

// Lấy danh sách tất cả users
router.get('/list', authenticateToken, checkAdminPermission, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT USER_ID, USERNAME, COMPANY_ID, CREATED_AT, DEPARTMENT, AVATAR
       FROM users
       ORDER BY USER_ID`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Lỗi server' });
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

// Tạo user mới
router.post('/create', authenticateToken, checkAdminPermission, async (req, res) => {
  const { username, company_id, password_hash, department } = req.body;
  let connection;

  try {
    // Validate input
    if (!username || !company_id || !password_hash) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    connection = await database.getConnection();

    // Check if company_id already exists
    const checkResult = await connection.execute(
      `SELECT COUNT(*) as COUNT FROM users WHERE COMPANY_ID = :company_id`,
      { company_id: company_id.trim() },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows[0].COUNT > 0) {
      return res.status(400).json({ message: 'ID công ty đã tồn tại' });
    }

    // Get next user_id
    const idResult = await connection.execute(
      `SELECT NVL(MAX(USER_ID), 0) + 1 AS next_id FROM users`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    const nextId = idResult.rows[0].NEXT_ID;

    // Insert new user
    await connection.execute(
      `INSERT INTO users (USER_ID, USERNAME, COMPANY_ID, PASSWORD_HASH, DEPARTMENT, CREATED_AT)
       VALUES (:user_id, :username, :company_id, :password_hash, :department, SYSDATE)`,
      {
        user_id: nextId,
        username: username.trim(),
        company_id: company_id.trim(),
        password_hash: password_hash.trim(),
        department: department ? department.trim() : null
      },
      { autoCommit: true }
    );

    res.json({
      message: 'Tạo user thành công',
      data: {
        user_id: nextId,
        username: username.trim(),
        company_id: company_id.trim(),
        department: department
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Lỗi server' });
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

// Cập nhật thông tin user
router.put('/update/:userId', authenticateToken, checkAdminPermission, async (req, res) => {
  const { userId } = req.params;
  const { username, password_hash, is_admin } = req.body;
  let connection;

  try {
    connection = await database.getConnection();

    // Check if user exists
    const checkResult = await connection.execute(
      `SELECT COUNT(*) as COUNT FROM users WHERE USER_ID = :user_id`,
      { user_id: userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows[0].COUNT === 0) {
      return res.status(404).json({ message: 'Không tìm thấy user' });
    }

    // Build update query based on provided fields
    let updateFields = [];
    let bindParams = { user_id: userId };

    if (username) {
      updateFields.push('USERNAME = :username');
      bindParams.username = username.trim();
    }

    if (password_hash) {
      updateFields.push('PASSWORD_HASH = :password_hash');
      bindParams.password_hash = password_hash.trim();
    }

    if (is_admin !== undefined) {
      updateFields.push('IS_ADMIN = :is_admin');
      bindParams.is_admin = is_admin ? 1 : 0;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'Không có trường nào được cập nhật' });
    }

    // Execute update
    await connection.execute(
      `UPDATE users SET ${updateFields.join(', ')} WHERE USER_ID = :user_id`,
      bindParams,
      { autoCommit: true }
    );

    res.json({
      message: 'Cập nhật thành công',
      data: {
        user_id: userId,
        ...bindParams
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Lỗi server' });
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

// Xóa user
router.delete('/delete/:userId', authenticateToken, checkAdminPermission, async (req, res) => {
  const { userId } = req.params;
  let connection;

  try {
    connection = await database.getConnection();

    // Check if user exists
    const checkResult = await connection.execute(
      `SELECT COUNT(*) as COUNT FROM users WHERE USER_ID = :user_id`,
      { user_id: userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows[0].COUNT === 0) {
      return res.status(404).json({ message: 'Không tìm thấy user' });
    }

    // Delete user
    await connection.execute(
      `DELETE FROM users WHERE USER_ID = :user_id`,
      { user_id: userId },
      { autoCommit: true }
    );

    res.json({
      message: 'Xóa user thành công',
      data: { user_id: userId }
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Lỗi server' });
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