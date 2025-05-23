const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
const jwt = require('jsonwebtoken');
require('dotenv').config();

oracledb.fetchAsBuffer = [oracledb.BLOB];
oracledb.autoCommit = true;


// Middleware xác thực token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Bạn không có quyền cho thao tác này' });
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
const checkUserPermission = async (req, res, next) => {
  let connection;
  try {
    connection = await database.getConnection();    
    if (req.user.company_id !== '001507' && req.user.company_id !== '021253') {
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

// Middleware kiểm tra quyền chỉnh sửa
const checkEditPermission = async (req, res, next) => {
  let connection;
  try {
    connection = await database.getConnection();
    if (req.user.company_id !== '001507' && req.user.company_id !== '021253') {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
    }
    next();
  } catch (error) {
    console.error('Error checking edit permission:', error);
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

// Route chỉ cần xác thực token để xem
router.get('/list-impedance', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT IMP_ID as imp_id,
              IMP_1, IMP_2, IMP_3, IMP_4, IMP_5, IMP_6, IMP_7, IMP_8, IMP_9,
              IMP_10, IMP_11, IMP_12, IMP_13, IMP_14, IMP_15, IMP_16, IMP_17,
              IMP_18, IMP_19, IMP_20, IMP_21, IMP_22, IMP_23, IMP_24, IMP_25, 
              IMP_26, IMP_27, IMP_28, IMP_29, IMP_30, IMP_31, IMP_32, IMP_33,
              IMP_34, IMP_35, IMP_36, IMP_37, IMP_38, IMP_39, IMP_40, IMP_41,
              IMP_42, IMP_43, IMP_44, IMP_45, IMP_46, IMP_47, IMP_48, IMP_49,
              IMP_50, IMP_51, NOTE as note
       FROM impedances
       WHERE IS_DELETED = 0 OR IS_DELETED IS NULL
       ORDER BY IMP_ID DESC`,
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

// Các route cần quyền chỉnh sửa
router.post('/create-impedance', authenticateToken, checkEditPermission, async (req, res) => {
  let connection;
  try {
    
    const data = req.body;
    connection = await database.getConnection();
    const idResult = await connection.execute(
      `SELECT NVL(MAX(IMP_ID), 0) + 1 AS next_id FROM impedances`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    const nextId = idResult.rows[0].NEXT_ID;
    console.log('Next ID:', nextId); 

    // Build SQL column and values list
    let columns = ['IMP_ID'];
    let bindVars = { imp_id: nextId }; 
    let placeholders = [':imp_id']; 
    
    // Process all possible impedance fields
    for (let i = 1; i <= 51; i++) {
      const reqField = `imp_${i}`; 
      const dbField = `IMP_${i}`; 
      
      if (data[reqField] !== undefined && data[reqField] !== null && data[reqField] !== '') {
        columns.push(dbField);
        placeholders.push(`:${reqField}`);
        bindVars[reqField] = data[reqField].toString();
      }
    }
    
    // Add note if provided
    if (data.note) {
      columns.push('NOTE');
      placeholders.push(':note');
      bindVars.note = data.note;
    }
    
    // Construct and execute the insert query
    const insertQuery = `
      INSERT INTO impedances (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
    `;
    

    await connection.execute(insertQuery, bindVars, { autoCommit: true });
    const newRecord = await connection.execute(
      `SELECT IMP_ID as imp_id, 
              IMP_1, IMP_2, IMP_3, IMP_4, IMP_5, IMP_6, IMP_7, IMP_8, IMP_9,
              IMP_10, IMP_11, IMP_12, IMP_13, IMP_14, IMP_15, IMP_16, IMP_17,
              IMP_18, IMP_19, IMP_20, IMP_21, IMP_22, IMP_23, IMP_24, IMP_25, 
              IMP_26, IMP_27, IMP_28, IMP_29, IMP_30, IMP_31, IMP_32, IMP_33,
              IMP_34, IMP_35, IMP_36, IMP_37, IMP_38, IMP_39, IMP_40, IMP_41,
              IMP_42, IMP_43, IMP_44, IMP_45, IMP_46, IMP_47, IMP_48, IMP_49,
              IMP_50, IMP_51,
              NOTE as note
       FROM impedances 
       WHERE IMP_ID = :imp_id`,
      { imp_id: nextId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    if (!newRecord.rows || newRecord.rows.length === 0) {
      throw new Error('Record was not created properly');
    }
    
    // Add lowercase versions for compatibility
    const responseData = newRecord.rows[0];
    for (let i = 1; i <= 51; i++) {
      const upperField = `IMP_${i}`;
      const lowerField = `imp_${i}`;
      if (responseData[upperField]) {
        responseData[lowerField] = responseData[upperField];
      }
    }
    
    res.json({
      message: 'Thêm mới thành công',
      data: responseData
    });
  } catch (err) {
    console.error('Error creating impedance:', err);
    console.log('Error details:', { 
      message: err.message,
      stack: err.stack,
      code: err.code,
      errorNum: err.errorNum,
      offset: err.offset
    });
    
    res.status(500).json({ 
      message: 'Lỗi server', 
      error: err.message,
      stack: err.stack
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

router.put('/update-impedance/:impId', authenticateToken, checkEditPermission, async (req, res) => {
  const { impId } = req.params;
  const updateData = req.body;
  let connection;

  try {
    // Check if impId is undefined or not valid
    if (!impId || impId === 'undefined' || impId === 'null') {
      return res.status(400).json({
        message: 'ID không hợp lệ',
        error: 'Yêu cầu cần có ID hợp lệ để cập nhật dữ liệu'
      });
    }
    connection = await database.getConnection();
    const checkRecord = await connection.execute(
      `SELECT COUNT(*) as COUNT FROM impedances WHERE IMP_ID = :id`,
      { id: impId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    if (!checkRecord.rows[0] || checkRecord.rows[0].COUNT === 0) {
      return res.status(404).json({ 
        message: 'Không tìm thấy bản ghi',
        error: `Không tìm thấy bản ghi với ID ${impId}`
      });
    }
    const updateFields = [];
    const bindParams = { imp_id: impId }; 
    for (let i = 1; i <= 51; i++) {
      const reqField = `imp_${i}`; 
      const dbField = `IMP_${i}`;  
      if (updateData[reqField] !== undefined && updateData[reqField] !== null) {
        updateFields.push(`${dbField} = :${reqField}`);
        bindParams[reqField] = updateData[reqField].toString();
      }
    }
    
    
    if (updateData.note !== undefined && updateData.note !== null) {
      updateFields.push(`NOTE = :note`);
      bindParams.note = updateData.note;
    }
    
    
    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'Không có trường dữ liệu nào được cung cấp để cập nhật' });
    }
    
    
    const updateQuery = `
      UPDATE impedances 
      SET ${updateFields.join(', ')} 
      WHERE IMP_ID = :imp_id
    `;
    
    const result = await connection.execute(updateQuery, bindParams, { autoCommit: true });
    
    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi với ID đã cung cấp' });
    }

    const updatedRecord = await connection.execute(
      `SELECT IMP_ID as imp_id, 
              IMP_1, IMP_2, IMP_3, IMP_4, IMP_5, IMP_6, IMP_7, IMP_8, IMP_9,
              IMP_10, IMP_11, IMP_12, IMP_13, IMP_14, IMP_15, IMP_16, IMP_17,
              IMP_18, IMP_19, IMP_20, IMP_21, IMP_22, IMP_23, IMP_24, IMP_25, 
              IMP_26, IMP_27, IMP_28, IMP_29, IMP_30, IMP_31, IMP_32, IMP_33,
              IMP_34, IMP_35, IMP_36, IMP_37, IMP_38, IMP_39, IMP_40, IMP_41,
              IMP_42, IMP_43, IMP_44, IMP_45, IMP_46, IMP_47, IMP_48, IMP_49,
              IMP_50, IMP_51,
              NOTE as note
       FROM impedances 
       WHERE IMP_ID = :imp_id`,
      { imp_id: impId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!updatedRecord.rows || updatedRecord.rows.length === 0) {
      throw new Error('Failed to retrieve updated record');
    }
    const updatedData = updatedRecord.rows[0];
    for (let i = 1; i <= 51; i++) {
      const upperKey = `IMP_${i}`;
      const lowerKey = `imp_${i}`;
      if (updatedData[upperKey] !== undefined) {
        updatedData[lowerKey] = updatedData[upperKey];
      }
    }

    if (updatedData.NOTE !== undefined) {
      updatedData.note = updatedData.NOTE;
    }

    const response = {
      message: 'Cập nhật thành công',
      data: updatedData
    };
    
    res.json(response);
  } catch (err) {
    console.error('Error updating impedance:', err);
    console.log('Error details:', { // Changed from logDebug to console.log
      message: err.message,
      stack: err.stack,
      code: err.code,
      errorNum: err.errorNum,
    });
    
    res.status(500).json({ 
      message: 'Lỗi server', 
      error: err.message,
      stack: err.stack
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

router.put('/soft-delete-impedance/:impId', authenticateToken, checkEditPermission, async (req, res) => {
  const { impId } = req.params;
  let connection;

  try {
    if (!impId || impId === 'undefined' || impId === 'null') {
      return res.status(400).json({
        message: 'ID không hợp lệ',
        error: 'Yêu cầu cần có ID hợp lệ để xóa dữ liệu'
      });
    }

    connection = await database.getConnection();
    
    const checkRecord = await connection.execute(
      `SELECT COUNT(*) as COUNT FROM impedances WHERE IMP_ID = :id`,
      { id: impId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    if (!checkRecord.rows[0] || checkRecord.rows[0].COUNT === 0) {
      return res.status(404).json({ 
        message: 'Không tìm thấy bản ghi',
        error: `Không tìm thấy bản ghi với ID ${impId}`
      });
    }

    const result = await connection.execute(
      `UPDATE impedances SET IS_DELETED = 1 WHERE IMP_ID = :imp_id`,
      { imp_id: impId },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi với ID đã cung cấp' });
    }

    res.json({
      message: 'Xóa thành công',
      data: { imp_id: impId }
    });
  } catch (err) {
    console.error('Error soft deleting impedance:', err);
    res.status(500).json({ 
      message: 'Lỗi server', 
      error: err.message
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

module.exports = router;