const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { refreshAccessToken } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  const { company_id, password_hash } = req.body; 
  let connection;

  try {
    connection = await database.getConnection();
    
    const userCheck = await connection.execute(
      `SELECT USER_ID, USERNAME, COMPANY_ID, PASSWORD_HASH, IS_DELETED, ROLE
       FROM users 
       WHERE COMPANY_ID = :company_id`,
      { company_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (userCheck.rows.length === 0) {
      return res.status(401).json({ message: 'ID công ty hoặc mật khẩu không đúng' });
    }
    const user = userCheck.rows[0];
    // Check if account is disabled
    if (user.IS_DELETED === 1) {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị vô hiệu hóa' });
    }
    // Check password_hash without trim()
    if (password_hash !== user.PASSWORD_HASH) {
      return res.status(401).json({ 
        message: 'ID công ty hoặc mật khẩu không đúng'
      });
    }

    // Generate token and complete login
    const userPayload = {
      username: user.USERNAME,
      userId: user.USER_ID,
      company_id: user.COMPANY_ID.trim(),
      role: user.ROLE
    };
    const accessToken = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign(userPayload, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Đăng nhập thành công',
      accessToken,
      refreshToken,
      user: userPayload
    });
  } catch (error) {
    console.error('Error during login:', error);
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
// Thêm API để lấy avatar
router.get('/avatar/:user_id', async (req, res) => {
    const { user_id } = req.params;
    let connection;
    
    try {
        connection = await database.getConnection();
        const result = await connection.execute(
            `SELECT avatar FROM users WHERE user_id = :user_id`,
            [user_id]
        );

        if (result.rows.length === 0 || !result.rows[0][0]) {
            return res.status(404).send();
        }

        const avatar = result.rows[0][0];
        res.setHeader('Content-Type', 'image/*');
        res.send(avatar);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Lỗi server" });
    } finally {
        if (connection) {
            await connection.close();
        }
    }
});

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

// Route lấy thông tin profile
router.get('/profile', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT username, company_id, role FROM users WHERE company_id = :company_id`,
      { company_id: req.user.company_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin người dùng' });
    }

    const user = result.rows[0];
    res.json({
      username: user.USERNAME,
      company_id: user.COMPANY_ID.trim(),
      role: user.ROLE
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
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

router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token không được cung cấp' });
    }
    
    const tokens = refreshAccessToken(refreshToken);
    res.json(tokens);
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(403).json({ message: 'Refresh token không hợp lệ' });
  }
});

module.exports = router;