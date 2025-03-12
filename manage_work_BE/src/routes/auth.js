const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
require('dotenv').config();

router.post('/login', async (req, res) => {
    const { company_id, password } = req.body;

    if (!company_id || !password) {
        return res.status(400).json({ message: "Vui lòng nhập ID công ty và mật khẩu" });
    }

    let connection;
    try {
        connection = await database.getConnection();

        const result = await connection.execute(
            `SELECT user_id, username, avatar FROM users WHERE company_id = :company_id AND password_hash = :password_hash`,
            [company_id, password],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ message: "ID công ty hoặc mật khẩu không đúng" });
        }

        const user = result.rows[0];

        res.json({ 
            user: { 
                user_id: user.USER_ID, 
                username: user.USERNAME, 
                company_id,
                avatar: user.AVATAR 
            } 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Lỗi server" });
    } finally {
        if (connection) {
            await connection.close();
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

module.exports = router;