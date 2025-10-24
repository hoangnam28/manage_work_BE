const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Tạo thư mục uploads nếu chưa tồn tại
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình multer để upload file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Chỉ chấp nhận file ảnh
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file ảnh (jpeg, jpg, png, gif, webp)'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // Giới hạn 5MB
  },
  fileFilter: fileFilter
});


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
    const result = await connection.execute(
      `SELECT ROLE FROM users WHERE COMPANY_ID = :company_id`,
      { company_id: req.user.company_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (
      result.rows.length === 0 ||
      !String(result.rows[0].ROLE || '')
        .split(',')
        .map(r => r.trim().toLowerCase())
        .includes('admin')
    ) {
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


router.post('/upload-avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Không tìm thấy file' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;

    res.json({
      message: 'Upload avatar thành công',
      url: avatarUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ message: 'Lỗi khi upload avatar', error: error.message });
  }
});

// Lấy danh sách tất cả users
router.get('/list', authenticateToken, checkAdminPermission, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT USER_ID, USERNAME, COMPANY_ID, CREATED_AT, DEPARTMENT, AVATAR, ROLE, EMAIL
       FROM users
       WHERE IS_DELETED = 0
       ORDER BY USER_ID ASC`,
      {},
      { 
        maxRows: 1000000,
        outFormat: oracledb.OUT_FORMAT_OBJECT 
      }
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
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
  const { username, company_id, password_hash, department, role, email, avatar } = req.body;
  let connection;

  try {
    // Validate input
    if (!username || !company_id || !password_hash || !role) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    // Validate role (multi-role: array or comma string)
    const validRoles = ['admin', 'editor', 'viewer', 'imp', 'bo'];
    let roleStr = '';
    if (Array.isArray(role)) {
      for (const r of role) {
        if (!validRoles.includes(r)) {
          return res.status(400).json({ message: 'Role không hợp lệ' });
        }
      }
      roleStr = role.join(',');
    } else if (typeof role === 'string') {
      const rolesArr = role.split(',').map(r => r.trim()).filter(Boolean);
      for (const r of rolesArr) {
        if (!validRoles.includes(r)) {
          return res.status(400).json({ message: 'Role không hợp lệ' });
        }
      }
      roleStr = rolesArr.join(',');
    } else {
      return res.status(400).json({ message: 'Role không hợp lệ' });
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
      `INSERT INTO users (USER_ID, USERNAME, COMPANY_ID, PASSWORD_HASH, DEPARTMENT, CREATED_AT, ROLE, EMAIL, AVATAR)
       VALUES (:user_id, :username, :company_id, :password_hash, :department, SYSDATE, :role, :email, :avatar)`,
      {
        user_id: nextId,
        username: username.trim(),
        company_id: company_id.trim(),
        password_hash: password_hash.trim(),
        department: department ? department.trim() : null,
        role: roleStr,
        email: email ? email.trim() : null,
        avatar: avatar || null
      },
      { autoCommit: true }
    );

    res.json({
      message: 'Tạo user thành công',
      data: {
        USER_ID: nextId,
        USERNAME: username.trim(),
        COMPANY_ID: company_id.trim(),
        DEPARTMENT: department,
        ROLE: roleStr,
        EMAIL: email,
        AVATAR: avatar || null
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
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
router.put('/update/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  const { username, password_hash, role, email, department, avatar } = req.body;
  
  let connection;

  try {
    connection = await database.getConnection();
    const userExists = await connection.execute(
      `SELECT USERNAME, PASSWORD_HASH, ROLE, EMAIL, DEPARTMENT, AVATAR FROM users 
       WHERE USER_ID = :user_id AND IS_DELETED = 0`,
      { user_id: userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (userExists.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Validate role if provided (multi-role)
    let roleStr = undefined;
    if (role) {
      const validRoles = ['admin', 'editor', 'viewer', 'imp', 'bo'];
      if (Array.isArray(role)) {
        for (const r of role) {
          if (!validRoles.includes(r)) {
            return res.status(400).json({ message: 'Role không hợp lệ' });
          }
        }
        roleStr = role.join(',');
      } else if (typeof role === 'string') {
        const rolesArr = role.split(',').map(r => r.trim()).filter(Boolean);
        for (const r of rolesArr) {
          if (!validRoles.includes(r)) {
            return res.status(400).json({ message: 'Role không hợp lệ' });
          }
        }
        roleStr = rolesArr.join(',');
      } else {
        return res.status(400).json({ message: 'Role không hợp lệ' });
      }
    }

    const updateFields = [];
    const bindParams = { user_id: userId };

    if (username && username !== userExists.rows[0].USERNAME) {
      const usernameCheck = await connection.execute(
        `SELECT COUNT(*) as COUNT FROM users 
         WHERE USERNAME = :username 
         AND USER_ID != :user_id 
         AND IS_DELETED = 0`,
        { username, user_id: userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (usernameCheck.rows[0].COUNT > 0) {
        return res.status(400).json({ message: 'Tên người dùng đã tồn tại' });
      }

      updateFields.push('USERNAME = :username');
      bindParams.username = username;
    }

    if (password_hash) {
      updateFields.push('PASSWORD_HASH = :password_hash');
      bindParams.password_hash = password_hash;
    }

    if (roleStr !== undefined && roleStr !== userExists.rows[0].ROLE) {
      updateFields.push('ROLE = :role');
      bindParams.role = roleStr;
    }

    if (email !== undefined) {
      updateFields.push('EMAIL = :email');
      bindParams.email = email;
    }

    if (department !== undefined) {
      updateFields.push('DEPARTMENT = :department');
      bindParams.department = department;
    }

    if (avatar !== undefined) {
  updateFields.push('AVATAR = :avatar');
  bindParams.avatar = avatar;
  
  // Xóa avatar cũ nếu có
  const oldAvatar = userExists.rows[0].AVATAR;
  if (oldAvatar && oldAvatar !== avatar) {
    const oldAvatarPath = path.join(__dirname, '..', oldAvatar);
    if (fs.existsSync(oldAvatarPath)) {
      fs.unlinkSync(oldAvatarPath);
    }
  }
}

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'Không có thông tin nào được cập nhật' });
    }

    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE USER_ID = :user_id
      AND IS_DELETED = 0
    `;

    await connection.execute(updateQuery, bindParams, { autoCommit: true });

    const updatedUser = await connection.execute(
      `SELECT USER_ID, USERNAME, ROLE, EMAIL, DEPARTMENT, AVATAR FROM users WHERE USER_ID = :user_id`,
      { user_id: userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      message: 'Cập nhật thông tin người dùng thành công',
      data: updatedUser.rows[0]
    });

  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error('Error closing connection:', error);
      }
    }
  }
});

// Xóa user (soft delete)
router.delete('/delete/:userId', authenticateToken, checkAdminPermission, async (req, res) => {
  const { userId } = req.params;
  let connection;

  try {
    connection = await database.getConnection();
    const checkResult = await connection.execute(
      `SELECT COUNT(*) as COUNT FROM users 
       WHERE USER_ID = :user_id AND IS_DELETED = 0`,
      { user_id: userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows[0].COUNT === 0) {
      return res.status(404).json({ message: 'Không tìm thấy user hoặc user đã bị xóa' });
    }

    await connection.execute(
      `UPDATE users 
       SET IS_DELETED = 1
       WHERE USER_ID = :user_id`,
      { user_id: userId },
      { autoCommit: true }
    );

    res.json({
      message: 'Xóa user thành công',
      data: { user_id: userId }
    });
  } catch (error) {
    console.error('Error soft deleting user:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
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