const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx'); // Thêm thư viện xlsx để thao tác file .xlsm

const {addHistoryNewRecord} = require('./material-new-history'); 
const { authenticateToken } = require('../middleware/auth');

// Lấy danh sách material core
router.get('/list', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(`SELECT 
        id,
        requester_name,
        request_date,
        status,
        vendor,
        family_core,
        family_pp,
        is_hf,
        material_type,
        erp,
        erp_vendor,
        is_caf,
        tg,
        bord_type,
        plastic,
        file_name,
        data,
        is_deleted
       FROM material_new
       WHERE is_deleted = 0
       ORDER BY id DESC`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json({
      data: result.rows
    });
  } catch (err) {
    console.error('Error in /list route:', err);
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

// Thêm mới material core
router.post('/create', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const data = req.body;
    
    console.log('Received data:', data);

    // Validate required fields
    const requiredFields = ['VENDOR', 'FAMILY_CORE', 'FAMILY_PP', 'IS_HF', 'IS_CAF'];
    const missingFields = requiredFields.filter(field => data[field] === undefined || data[field] === '');
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Get next ID using sequence
    const idResult = await connection.execute(
      `SELECT NVL(MAX(id), 0) + 1 AS nextId FROM material_new`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const nextId = idResult.rows[0].NEXTID;
    console.log('Generated ID:', nextId);

    // Prepare bind parameters with proper type conversion
    const bindParams = {
      id: nextId,
      requester_name: data.REQUESTER_NAME || '',
      request_date: data.REQUEST_DATE ? new Date(data.REQUEST_DATE) : new Date(),
      status: data.STATUS || 'Pending',
      vendor: data.VENDOR || '',
      family_core: data.FAMILY_CORE || '',
      family_pp: data.FAMILY_PP || '',
      is_hf: Number(data.IS_HF) || 0,
      material_type: data.MATERIAL_TYPE || '',
      erp: data.ERP || '',
      erp_vendor: data.ERP_VENDOR || '',
      is_caf: Number(data.IS_CAF) || 0,
      tg: data.TG || '',
      bord_type: data.BORD_TYPE || '',
      plastic: data.PLASTIC || '',
      file_name: data.FILE_NAME || '',
      data: data.DATA || '',
      is_deleted: 0,
    };
    
    console.log('Prepared bind parameters:', bindParams);

    // Execute insert with proper error handling
    try {
      await connection.execute(
        `INSERT INTO material_new (
          id, requester_name, request_date, status, vendor, family_core,
          family_pp, is_hf, material_type, erp, erp_vendor, is_caf,
          tg, bord_type, plastic, file_name, data,
          is_deleted
        ) VALUES (
          :id, :requester_name, :request_date, :status, :vendor, :family_core,
          :family_pp, :is_hf, :material_type, :erp, :erp_vendor, :is_caf,
          :tg, :bord_type, :plastic, :file_name, :data,
          :is_deleted
        )`,
        bindParams,
        { autoCommit: true }
      );
      try {
        await addHistoryNewRecord(connection, {
          materialNewId: nextId,
          actionType: 'CREATE',
          createdBy: req.user.username,
          data: {
            vendor: data.VENDOR,
            family_core: data.FAMILY_CORE,
            family_pp: data.FAMILY_PP,
            is_hf: data.IS_HF,
            material_type: data.MATERIAL_TYPE,
            erp: data.ERP,
            erp_vendor: data.ERP_VENDOR,
            tg: data.TG,
            is_caf: data.IS_CAF,
            bord_type: data.BORD_TYPE,
            plastic: data.PLASTIC,
            file_name: data.FILE_NAME,
            data: data.DATA
          }
        });
      } catch (historyError) {
        console.error('Warning: Failed to record history:', historyError);
        // Continue execution even if history recording fails
      }

      // Verify the insert by selecting the new record
      const verifyResult = await connection.execute(
        `SELECT * FROM material_new WHERE id = :id`,
        { id: nextId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!verifyResult.rows || verifyResult.rows.length === 0) {
        throw new Error('Record not found after insert');
      }
      
      console.log('Insert successful, verified record:', verifyResult.rows[0]);

      res.status(201).json({
        success: true,
        message: 'Thêm mới thành công',
        data: verifyResult.rows[0]
      });
      
    } catch (insertError) {
      console.error('Error during insert:', insertError);
      throw new Error(`Failed to insert record: ${insertError.message}`);
    }
    
  } catch (error) {
    console.error('Error creating material:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi thêm mới',
      error: error.message,
      details: error.stack
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

// Cập nhật material core
router.put('/update/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  let connection;

  try {
    if (!id) {
      return res.status(400).json({
        message: 'ID không hợp lệ'
      });
    }

    connection = await database.getConnection();

    // Chuyển đổi tên trường từ UPPERCASE sang lowercase để khớp với mapping
    const normalizedUpdateData = {};
    Object.keys(updateData).forEach(key => {
      const lowerKey = key.toLowerCase();
      normalizedUpdateData[lowerKey] = updateData[key];
    });

    console.log('Original updateData:', updateData);
    console.log('Normalized updateData:', normalizedUpdateData);

    // Validation với tên trường đã normalize
    if (normalizedUpdateData.status && !['Approve', 'Cancel', 'Pending'].includes(normalizedUpdateData.status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    // Fix validation cho is_hf - should check for 0/1 not TRUE/FALSE
    if (normalizedUpdateData.is_hf !== undefined && ![0, 1, '0', '1'].includes(normalizedUpdateData.is_hf)) {
      return res.status(400).json({ message: 'Giá trị is_hf không hợp lệ' });
    }

    if (normalizedUpdateData.is_caf !== undefined && ![0, 1, '0', '1'].includes(normalizedUpdateData.is_caf)) {
      return res.status(400).json({ message: 'Giá trị is_caf không hợp lệ' });
    }

    const updateFields = [];
    const bindParams = { id };
    
    // Updated column mapping to match your database schema
    const columnMapping = {
      id: 'ID',
      requester_name: 'requester_name',
      request_date: 'request_date',
      status: 'status',
      vendor: 'vendor',
      family_core: 'family_core',
      family_pp: 'family_pp',
      is_hf: 'is_hf',
      material_type: 'material_type',
      erp: 'erp',
      erp_vendor: 'erp_vendor',
      is_caf: 'is_caf',
      tg: 'tg',
      bord_type: 'bord_type',
      plastic: 'plastic',
      file_name: 'file_name',
      data: 'data',
      is_deleted: 'is_deleted',
    };

    const safeNumber = (value, precision = null) => {
      if (value === '' || value === null || value === undefined) {
        return null;
      }
      const cleanValue = String(value).replace(/[^\d.-]/g, '');
      const num = precision !== null ? parseFloat(cleanValue) : parseInt(cleanValue, 10);
      return isNaN(num) ? null : num;
    };

    const integerFields = ['id', 'is_hf', 'is_caf', 'is_deleted'];

    // Use normalized data for processing
    Object.keys(normalizedUpdateData).forEach(key => {
      if (normalizedUpdateData[key] !== undefined && columnMapping[key]) {
        const columnName = columnMapping[key];
        updateFields.push(`${columnName} = :${key}`);
        
        if (key === 'request_date' || key === 'complete_date') {
          bindParams[key] = normalizedUpdateData[key] ? new Date(normalizedUpdateData[key]) : null;
        } else if (integerFields.includes(key)) {
          bindParams[key] = safeNumber(normalizedUpdateData[key]);
          console.log(`Converting ${key} from`, normalizedUpdateData[key], 'to', bindParams[key]);
        } else {
          bindParams[key] = normalizedUpdateData[key] || null;
        }
      } else if (normalizedUpdateData[key] !== undefined && !columnMapping[key]) {
        console.warn(`Field ${key} not found in column mapping`);
      }
    });

    console.log('Update fields:', updateFields);
    console.log('Bind params:', bindParams);

    if (updateFields.length === 0) {
      return res.status(400).json({ 
        message: 'Không có dữ liệu cập nhật',
        debug: {
          receivedFields: Object.keys(updateData),
          normalizedFields: Object.keys(normalizedUpdateData),
          mappedFields: Object.keys(columnMapping)
        }
      });
    }

    const updateQuery = `
      UPDATE material_new
      SET ${updateFields.join(', ')}
      WHERE id = :id
    `;

    console.log('Final update query:', updateQuery);

    const result = await connection.execute(updateQuery, bindParams, { autoCommit: true });

    console.log('Update result:', result);

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }

    // Get updated record
    const updatedRecord = await connection.execute(
      `SELECT * FROM material_new WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    await addHistoryNewRecord(connection, {
      materialNewId: id,
      actionType: 'UPDATE',
      data: updateData, 
      createdBy: req.user.username
    });



    res.json({
      message: 'Cập nhật thành công',
      data: updatedRecord.rows[0]
    });

  } catch (err) {
    console.error('Error updating material properties:', err);
    res.status(500).json({
      message: 'Lỗi server',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
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
router.delete('/delete/:id', authenticateToken, async (req, res) => {
  let { id } = req.params;
  let connection;
  try {
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        message: 'ID không hợp lệ'
      });
    }
    id = Number(id);
    connection = await database.getConnection();
    const result = await connection.execute(
      `UPDATE material_new SET is_deleted = 1 WHERE id = :id`,
      { id },
      { autoCommit: true }
    );

     if (result.rowsAffected > 0) {
      // Lưu lịch sử
      await addHistoryNewRecord(connection, {
        materialNewId: id,
        actionType: 'DELETE',
        changeDetails: {
          description: 'Xóa Material PP'
        },
        createdBy: req.user.username
      });
    }
    if (result.rowsAffected === 0) {

      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }
    
    res.json({
      message: 'Xóa mềm thành công',
      id: id
    });
  } catch (err) {
    console.error('Error deleting material core:', err);
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

function numberToColumnName(num) {
  let result = '';
  while (num > 0) {
    num--;
    result = String.fromCharCode(65 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result;
}

function cloneFileSync(src, dest) {
  fs.copyFileSync(src, dest);
}

router.post('/export-xlsm', async (req, res) => {
  try {
    const data = req.body.data;
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ message: 'Invalid data format' });
    }

    const templatePath = path.join(__dirname, '../public/template/TemplateMaterial.xlsm');
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ message: 'Template file not found' });
    }

    const tempName = `MaterialPPExport_${Date.now()}.xlsm`;
    const tempPath = path.join(__dirname, `../public/template/${tempName}`);
    cloneFileSync(templatePath, tempPath);

    const workbook = XLSX.readFile(tempPath, { type: 'binary', bookVBA: true });

    const sheetName = workbook.SheetNames[7];
    if (!sheetName) {
      fs.unlinkSync(tempPath);
      return res.status(500).json({ message: 'Sheet 7 not found in template' });
    }

    const ws = workbook.Sheets[sheetName];

    const map = [
      'VENDOR','FAMILY','GLASS_STYLE','RESIN_PERCENTAGE', null, null,
      'PREFERENCE_CLASS','USE_TYPE', 'PP_TYPE',
      'TG_MIN','TG_MAX','CENTER_GLASS',null, null,'DK_01G','DF_01G','DK_0_001GHZ','DF_0_001GHZ','DK_0_01GHZ','DF_0_01GHZ',
      'DK_0_02GHZ','DF_0_02GHZ','DK_2GHZ','DF_2GHZ','DK_2_45GHZ','DF_2_45GHZ',
      'DK_3GHZ','DF_3GHZ','DK_4GHZ', 'DF_4GHZ','DK_5GHZ','DF_5GHZ',
      'DK_6GHZ', 'DF_6GHZ','DK_7GHZ', 'DF_7GHZ',
      'DK_8GHZ','DF_8GHZ','DK_9GHZ', 'DF_9GHZ','DK_10GHZ','DF_10GHZ','DK_15GHZ','DF_15GHZ',
      'DK_16GHZ','DF_16GHZ','DK_20GHZ','DF_20GHZ','DK_25GHZ','DF_25GHZ',
      'DK_30GHZ','DF_30GHZ','DK_35GHZ__','DF_35GHZ__','DK_40GHZ','DF_40GHZ',
      'DK_45GHZ','DF_45GHZ','DK_50GHZ','DF_50GHZ','DK_55GHZ','DF_55GHZ',
      'IS_HF','DATA_SOURCE'
    ];

    data.forEach((row, idx) => {
      const excelRow = idx + 3;
      let colIndex = 6;

      for (let i = 0; i < map.length; i++) {
        if (!map[i]) {
          colIndex++;
          continue;
        }
        const col = numberToColumnName(colIndex);
        const cell = `${col}${excelRow}`;
        let value = row[map[i]] ?? row[map[i]?.toLowerCase()] ?? '';
        ws[cell] = { t: 's', v: String(value) };
        colIndex++;
      }
    });

    XLSX.writeFile(workbook, tempPath, { bookType: 'xlsm', bookVBA: true });

    res.setHeader('Content-Disposition', `attachment; filename=MaterialCoreExport.xlsm`);
    res.setHeader('Content-Type', 'application/vnd.ms-excel.sheet.macroEnabled.12');

    const fileBuffer = fs.readFileSync(tempPath);
    res.end(fileBuffer);

    setTimeout(() => {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        console.warn('Could not cleanup temp file:', cleanupError.message);
      }
    }, 10000);

  } catch (err) {
    console.error('Export-xlsm error:', err);
    res.status(500).json({
      message: 'Export-xlsm failed',
      error: err.message,
      suggestion: 'Kiểm tra template file và định dạng dữ liệu input'
    });
  }
});


module.exports = router;
