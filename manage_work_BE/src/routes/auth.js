const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { refreshAccessToken } = require('../middleware/auth');
const { sendMail } = require('../helper/sendMailFg');

router.post('/login', async (req, res) => {
  const { company_id, password_hash } = req.body; 
  let connection;

  try {
    connection = await database.getConnection();
    
    // ✅ Thêm AVATAR và EMAIL vào query
    const userCheck = await connection.execute(
      `SELECT USER_ID, USERNAME, COMPANY_ID, PASSWORD_HASH, IS_DELETED, ROLE, EMAIL, AVATAR,
              DECODE(ROLE, 'imp', 1, 'bo', 1, 0) AS HAS_SPECIAL_ROLE
       FROM users 
       WHERE COMPANY_ID = :company_id`,
      { company_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (userCheck.rows.length === 0) {
      return res.status(401).json({ message: 'ID công ty hoặc mật khẩu không đúng' });
    }
    
    const user = userCheck.rows[0];
    
    if (user.IS_DELETED === 1) {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị vô hiệu hóa' });
    }
    
    if (password_hash !== user.PASSWORD_HASH) {
      return res.status(401).json({ 
        message: 'ID công ty hoặc mật khẩu không đúng'
      });
    }

    // ✅ Thêm email và avatar vào userPayload
    const userPayload = {
      userId: user.USER_ID,
      username: user.USERNAME,
      company_id: user.COMPANY_ID.trim(),
      role: user.ROLE,
      email: user.EMAIL,
      avatar: user.AVATAR  // ✅ Thêm avatar
    };
    
    const accessToken = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign(userPayload, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      message: 'Đăng nhập thành công',
      accessToken,
      refreshToken,
      user: userPayload  // ✅ user object đã có avatar
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
      `SELECT username, company_id, role, department FROM users WHERE company_id = :company_id`,
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
      role: user.ROLE,
      department: user.DEPARTMENT
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

    if (error.code === 'REFRESH_TOKEN_EXPIRED') {
      return res.status(401).json({ 
        message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
        code: 'REFRESH_TOKEN_EXPIRED'
      });
    }
    // Nếu refreshToken không hợp lệ cũng trả về 401
    return res.status(401).json({ 
      message: 'Refresh token không hợp lệ',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
});

// Change password - requires valid access token
router.post('/change-password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ message: 'Thiếu mật khẩu hiện tại hoặc mật khẩu mới' });
  }
  let connection;
  try {
    connection = await database.getConnection();
    const check = await connection.execute(
      `SELECT PASSWORD_HASH FROM users WHERE COMPANY_ID = :company_id`,
      { company_id: req.user.company_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    const stored = check.rows[0].PASSWORD_HASH;
    if (stored !== current_password) {
      return res.status(401).json({ message: 'Mật khẩu hiện tại không đúng' });
    }
    await connection.execute(
      `UPDATE users SET PASSWORD_HASH = :new_password WHERE COMPANY_ID = :company_id`,
      { new_password, company_id: req.user.company_id },
      { autoCommit: true }
    );
    return res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
});

// Forgot password - generate temporary password and email it
router.post('/forgot-password', async (req, res) => {
  const { company_id, email } = req.body || {};
  if (!company_id) {
    return res.status(400).json({ message: 'Vui lòng cung cấp ID công ty' });
  }
  let connection;
  try {
    connection = await database.getConnection();
    const userRs = await connection.execute(
      `SELECT USERNAME, COMPANY_ID FROM users WHERE COMPANY_ID = :company_id`,
      { company_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (userRs.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    const tmpPassword = Math.random().toString(36).slice(-10);
    await connection.execute(
      `UPDATE users SET PASSWORD_HASH = :pwd WHERE COMPANY_ID = :company_id`,
      { pwd: tmpPassword, company_id },
      { autoCommit: true }
    );

    const subject = 'MKVC Manage Work - Cấp lại mật khẩu tạm thời';
    const html = `
      <p>Xin chào ${userRs.rows[0].USERNAME},</p>
      <p>Mật khẩu tạm thời của bạn là: <b>${tmpPassword}</b></p>
      <p>Vui lòng đăng nhập và đổi mật khẩu ngay sau khi vào hệ thống.</p>
    `;
    const toList = email ? [email] : undefined;
    try {
      await sendMail(subject, html, toList);
    } catch (mailErr) {
      console.error('Send mail error:', mailErr);
      // vẫn trả thành công để người dùng có thể lấy mật khẩu qua admin nếu cần
    }
    return res.json({ message: 'Đã gửi mật khẩu tạm thời qua email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
});
module.exports = router;