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


// Middleware kiểm tra quyền chỉnh sửa
const checkEditPermission = async (req, res, next) => {
  let connection;
  try {
    connection = await database.getConnection();
    if (req.user.company_id !== '001507' && req.user.company_id !== '021253' && req.user.company_id !== '000001' && req.user.company_id !== '030783' && req.user.company_id !== '008048') {
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
    
    // Lấy tổng số bản ghi
    const countResult = await connection.execute(
      `SELECT COUNT(*) as total FROM impedances WHERE IS_DELETED = 0 OR IS_DELETED IS NULL`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    const total = countResult.rows[0].TOTAL;
    
    // Lấy dữ liệu với phân trang
    const result = await connection.execute(
      `SELECT IMP_ID as imp_id,
       IMP_1, IMP_2, IMP_3, IMP_4, IMP_5, IMP_6, IMP_7, IMP_8, IMP_9,
       IMP_10, IMP_11, IMP_12, IMP_13, IMP_14, IMP_15, IMP_16, IMP_17,
       IMP_18, IMP_19, IMP_20, IMP_21, IMP_22, IMP_23, IMP_24, IMP_25,
       IMP_26, IMP_27, IMP_28, IMP_29, IMP_30, IMP_31, IMP_32, IMP_33,
       IMP_34, IMP_35, IMP_36, IMP_37, IMP_38, IMP_39, IMP_40, IMP_41,
       IMP_42, IMP_43, IMP_44, IMP_45, IMP_46, IMP_47, IMP_48, IMP_49,
       IMP_50, IMP_51,
       IMP_52, IMP_53, IMP_54, IMP_55, IMP_56, IMP_57, IMP_58, IMP_59,
       IMP_60, IMP_61, IMP_62, IMP_63, IMP_64, IMP_65, IMP_66, IMP_67,
       IMP_68, IMP_69, IMP_70, IMP_71, IMP_72, IMP_73, IMP_74, IMP_75,
       IMP_76, IMP_77, IMP_78, IMP_79, IMP_80, IMP_81, IMP_82, IMP_83,
       IMP_84, IMP_85, IMP_86, IMP_87, IMP_88, IMP_89, IMP_90, IMP_91,
       IMP_92, IMP_93, IMP_94, IMP_95, IMP_96, IMP_97, IMP_98, IMP_99,
       IMP_100, IMP_101, IMP_102, IMP_103, IMP_104, IMP_105, IMP_106, IMP_107,
       IMP_108, IMP_109, IMP_110, IMP_111, IMP_112, IMP_113, IMP_114, IMP_115,
       IMP_116, IMP_117, IMP_118, IMP_119, IMP_120, IMP_121, IMP_122,
       IMP_123, IMP_124, IMP_125, IMP_126, IMP_127, IMP_128, IMP_129, IMP_130,
       IMP_131, IMP_132, IMP_133, IMP_134, IMP_135, 
       NOTE as note
       FROM impedances
       WHERE IS_DELETED = 0 OR IS_DELETED IS NULL
       ORDER BY IMP_ID DESC`,
      {},
      { 
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: 1000 // Tăng giới hạn số hàng tối đa
      }
    );
    
    // Đảm bảo result.rows là mảng
    const rows = Array.isArray(result.rows) ? result.rows : [];
    
    res.json({
      data: rows,
      total: total
    });
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
    for (let i = 1; i <= 135; i++) {
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
       IMP_52, IMP_53, IMP_54, IMP_55, IMP_56, IMP_57, IMP_58, IMP_59,
       IMP_60, IMP_61, IMP_62, IMP_63, IMP_64, IMP_65, IMP_66, IMP_67,
       IMP_68, IMP_69, IMP_70, IMP_71, IMP_72, IMP_73, IMP_74, IMP_75,
       IMP_76, IMP_77, IMP_78, IMP_79, IMP_80, IMP_81, IMP_82, IMP_83,
       IMP_84, IMP_85, IMP_86, IMP_87, IMP_88, IMP_89, IMP_90, IMP_91,
       IMP_92, IMP_93, IMP_94, IMP_95, IMP_96, IMP_97, IMP_98, IMP_99,
       IMP_100, IMP_101, IMP_102, IMP_103, IMP_104, IMP_105, IMP_106, IMP_107,
       IMP_108, IMP_109, IMP_110, IMP_111, IMP_112, IMP_113, IMP_114, IMP_115,
       IMP_116, IMP_117, IMP_118, IMP_119, IMP_120, IMP_121, IMP_122,
       IMP_123, IMP_124, IMP_125, IMP_126, IMP_127, IMP_128, IMP_129, IMP_130,
       IMP_131, IMP_132, IMP_133, IMP_134, IMP_135, 
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
    for (let i = 1; i <= 135; i++) {
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
    for (let i = 1; i <= 135; i++) {
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
      `SELECT IMP_ID AS imp_id,
       IMP_1, IMP_2, IMP_3, IMP_4, IMP_5, IMP_6, IMP_7, IMP_8, IMP_9,
       IMP_10, IMP_11, IMP_12, IMP_13, IMP_14, IMP_15, IMP_16, IMP_17,
       IMP_18, IMP_19, IMP_20, IMP_21, IMP_22, IMP_23, IMP_24, IMP_25,
       IMP_26, IMP_27, IMP_28, IMP_29, IMP_30, IMP_31, IMP_32, IMP_33,
       IMP_34, IMP_35, IMP_36, IMP_37, IMP_38, IMP_39, IMP_40, IMP_41,
       IMP_42, IMP_43, IMP_44, IMP_45, IMP_46, IMP_47, IMP_48, IMP_49,
       IMP_50, IMP_51, IMP_52, IMP_53, IMP_54, IMP_55, IMP_56, IMP_57,
       IMP_58, IMP_59, IMP_60, IMP_61, IMP_62, IMP_63, IMP_64, IMP_65,
       IMP_66, IMP_67, IMP_68, IMP_69, IMP_70, IMP_71, IMP_72, IMP_73,
       IMP_74, IMP_75, IMP_76, IMP_77, IMP_78, IMP_79, IMP_80, IMP_81,
       IMP_82, IMP_83, IMP_84, IMP_85, IMP_86, IMP_87, IMP_88, IMP_89,
       IMP_90, IMP_91, IMP_92, IMP_93, IMP_94, IMP_95, IMP_96, IMP_97,
       IMP_98, IMP_99, IMP_100, IMP_101, IMP_102, IMP_103, IMP_104,
       IMP_105, IMP_106, IMP_107, IMP_108, IMP_109, IMP_110, IMP_111,
       IMP_112, IMP_113, IMP_114, IMP_115, IMP_116, IMP_117, IMP_118,
       IMP_119, IMP_120, IMP_121, IMP_122, IMP_123, IMP_124, IMP_125,
       IMP_126, IMP_127, IMP_128, IMP_129, IMP_130, IMP_131, IMP_132,
       IMP_133, IMP_134, IMP_135,
       NOTE AS note
       FROM impedances
       WHERE IMP_ID = :imp_id`,
      { imp_id: impId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!updatedRecord.rows || updatedRecord.rows.length === 0) {
      throw new Error('Failed to retrieve updated record');
    }
    const updatedData = updatedRecord.rows[0];
    for (let i = 1; i <= 135; i++) {
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

// Route xử lý import dữ liệu từ Excel
router.post('/import-impedance', authenticateToken, checkEditPermission, async (req, res) => {
  let connection;
  try {
    const { data } = req.body;
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    }

    connection = await database.getConnection();

    // Get next IMP_ID using MAX + 1 instead of sequence
    const idResult = await connection.execute(
      'SELECT NVL(MAX(IMP_ID), 0) + 1 AS NEXT_ID FROM impedances',
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    console.log('ID Result:', idResult.rows[0]); // Debug log
    
    let nextId = Number(idResult.rows[0].NEXT_ID);
    console.log('Next ID (before):', nextId); // Debug log
    
    // Đảm bảo nextId là số hợp lệ
    if (isNaN(nextId)) {
      nextId = 1;
    }
    console.log('Next ID (after):', nextId); // Debug log

    let successCount = 0;
    let errorCount = 0;
    let errorRows = [];
    let errorDetails = [];

    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const record = data[rowIndex];
      let columns = ['IMP_ID'];
      let bindVars = { imp_id: nextId };
      let placeholders = [':imp_id'];

      try {
        console.log('Processing row', rowIndex + 1, 'with ID:', nextId); // Debug log
        // Process all possible impedance fields
        for (let i = 1; i <= 135; i++) {
          const key = `IMP_${i}`;
          let value = record[key];

          // Nếu giá trị là undefined, object, array, function => Bỏ qua
          if (value === undefined || typeof value === 'object' || typeof value === 'function') {
            continue;
          }

          // Nếu giá trị là null, hoặc chuỗi rỗng/gạch ngang/NaN/null => Set thành null
          if (
            value === null ||
            (typeof value === 'string' && (value.trim() === '' || value.trim() === '-' || value.trim().toLowerCase() === 'nan' || value.trim().toLowerCase() === 'null'))
          ) {
            bindVars[key.toLowerCase()] = null;
            columns.push(key);
            placeholders.push(`:${key.toLowerCase()}`);
            continue;
          }

          // Nếu là số, chuyển thành chuỗi
          if (typeof value === 'number') {
            if (Number.isFinite(value) && !isNaN(value)) {
              bindVars[key.toLowerCase()] = value.toString();
            } else {
              bindVars[key.toLowerCase()] = null;
            }
            columns.push(key);
            placeholders.push(`:${key.toLowerCase()}`);
            continue;
          }

          // Nếu là chuỗi, giữ nguyên sau khi trim
          if (typeof value === 'string') {
            const trimmedValue = value.trim();
            if (trimmedValue === '' || trimmedValue === '-' || trimmedValue.toLowerCase() === 'nan' || trimmedValue.toLowerCase() === 'null') {
              bindVars[key.toLowerCase()] = null;
            } else {
              bindVars[key.toLowerCase()] = trimmedValue;
            }
            columns.push(key);
            placeholders.push(`:${key.toLowerCase()}`);
            continue;
          }

          // Nếu là kiểu dữ liệu khác => Set null
          bindVars[key.toLowerCase()] = null;
          columns.push(key);
          placeholders.push(`:${key.toLowerCase()}`);
        }

        // Add note if provided
        if (record.NOTE) {
          columns.push('NOTE');
          placeholders.push(':note');
          bindVars.note = String(record.NOTE).trim();
        }

        // Add IS_DELETED with default value 0
        columns.push('IS_DELETED');
        placeholders.push(':is_deleted');
        bindVars.is_deleted = 0;

        // Construct and execute the insert query
        const insertQuery = `
          INSERT INTO impedances (${columns.join(', ')})
          VALUES (${placeholders.join(', ')})
        `;

        console.log('Insert Query:', insertQuery); // Debug log
        console.log('Bind Variables:', bindVars); // Debug log

        await connection.execute(insertQuery, bindVars, { autoCommit: true });
        nextId++;
        successCount++;
      } catch (insertError) {
        errorCount++;
        errorRows.push(rowIndex + 2);
        errorDetails.push({
          row: rowIndex + 2,
          error: insertError.message
        });
        console.error('Error inserting record at row', rowIndex + 2, insertError);
        continue;
      }
    }

    console.log(`Import thành công ${successCount} dòng, lỗi ${errorCount} dòng`);
    res.json({
      success: true,
      message: `Đã import thành công ${successCount} dòng, lỗi ${errorCount} dòng`,
      successCount,
      errorCount,
      errorRows,
      errorDetails
    });

  } catch (error) {
    console.error('Error importing impedance data:', error);
    res.status(500).json({ 
      message: 'Lỗi khi import dữ liệu',
      error: error.message 
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