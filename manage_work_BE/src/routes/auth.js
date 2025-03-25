const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
require('dotenv').config();
const jwt = require('jsonwebtoken');

router.post('/login', async (req, res) => {
    const { company_id, password_hash } = req.body;
    let connection;

    try {
        connection = await database.getConnection();
        // Log để debug
        console.log('Login attempt - Company ID:', company_id);

        const result = await connection.execute(
            `SELECT * FROM users WHERE TRIM(COMPANY_ID) = TRIM(:company_id)`,
            { company_id: company_id },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // if (result.rows.length > 0) {
        //     const user = result.rows[0];
        //     console.log('Found user:', user);
        //     console.log('Company ID from DB:', user.COMPANY_ID);
        // }

        if (result.rows.length === 0) {
            // Log tất cả company_id trong DB để debug
            const allUsers = await connection.execute(
                `SELECT COMPANY_ID FROM users`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            
            return res.status(401).json({ 
                message: 'ID của bạn nhập không tồn tại',
                debug: {
                    attempted_company_id: company_id,
                    company_id_length: company_id.length
                }
            });
        }   

        const user = result.rows[0];
        if (password_hash.trim() !== user.PASSWORD_HASH.trim()) {
            return res.status(401).json({ 
                message: 'Mật khẩu không đúng',
                debug: {
                    inputPassword: password_hash,
                    storedPassword: user.PASSWORD_HASH,
                    passwordLength: {
                        input: password_hash.length,
                        stored: user.PASSWORD_HASH.length
                    }
                }
            });
        }

        const token = jwt.sign(
            { 
                username: user.USERNAME,
                userId: user.USER_ID,
                company_id: user.COMPANY_ID.trim()
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Đăng nhập thành công',
            accessToken: token,
            user: {
                username: user.USERNAME,
                userId: user.USER_ID,
                company_id: user.COMPANY_ID.trim()
            }
        });
    } catch (error) {
        console.error('Login error:', error);
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
      `SELECT username, company_id FROM users WHERE company_id = :company_id`,
      { company_id: req.user.company_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin người dùng' });
    }

    const user = result.rows[0];
    res.json({
      username: user.USERNAME,
      company_id: user.COMPANY_ID.trim()
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

module.exports = router;