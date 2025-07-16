const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx'); // Thêm thư viện xlsx để thao tác file .xlsm

const { authenticateToken, checkEditPermission } = require('../middleware/auth');

// Lấy danh sách material core
router.get('/list', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(`SELECT 
        id,
        name,
        request_date,
        handler,
        status,
        complete_date,
        vendor,
        family,
        glass_style,
        resin_percentage,
        rav_thickness,
        preference_class,
        use_type,
        pp_type,
        tg_min,
        tg_max,
        DK_01G as dk_01g,
        DF_01G as df_01g,
        is_hf,
        data_source,
        filename,
        DK_0_001GHZ_ as dk_0_001ghz,
        DF_0_001GHZ_ as df_0_001ghz,
        DK_0_01GHZ_ as dk_0_01ghz,
        DF_0_01GHZ_ as df_0_01ghz,
        DK_0_02GHZ_ as dk_0_02ghz,
        DF_0_02GHZ_ as df_0_02ghz,
        DK_2GHZ_ as dk_2ghz,
        DF_2GHZ_ as df_2ghz,
        DK_2_45GHZ_ as dk_2_45ghz,
        DF_2_45GHZ_ as df_2_45ghz,
        DK_3GHZ_ as dk_3ghz,
        DF_3GHZ_ as df_3ghz,
        DK_4GHZ_ as dk_4ghz,
        DF_4GHZ_ as df_4ghz,
        DK_5GHZ_ as dk_5ghz,
        DF_5GHZ_ as df_5ghz,
        DK_6GHZ_ as dk_6ghz,
        DF_6GHZ_ as df_6ghz,
        DK_7GHZ_ as dk_7ghz,
        DF_7GHZ_ as df_7ghz,
        DK_8GHZ_ as dk_8ghz,
        DF_8GHZ_ as df_8ghz,
        DK_9GHZ_ as dk_9ghz,
        DF_9GHZ_ as df_9ghz,
        DK_10GHZ_ as dk_10ghz,
        DF_10GHZ_ as df_10ghz,
        DK_15GHZ_ as dk_15ghz,
        DF_15GHZ_ as df_15ghz,
        DK_16GHZ_ as dk_16ghz,
        DF_16GHZ_ as df_16ghz,
        DK_20GHZ_ as dk_20ghz,
        DF_20GHZ_ as df_20ghz,
        DK_25GHZ_ as dk_25ghz,
        DF_25GHZ_ as df_25ghz
       FROM material_properties
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
router.post('/create', async (req, res) => {
  let connection;
  try {
    const data = req.body;
     let resinArr = [];
    if (typeof data.resin_percentage === 'string') {
      resinArr = data.resin_percentage.split(',').map(v => Number(v.trim())).filter(v => !isNaN(v));
    } else if (Array.isArray(data.resin_percentage)) {
      resinArr = data.resin_percentage.map(v => Number(v)).filter(v => !isNaN(v));
    } else {
      resinArr = [Number(data.resin_percentage)];
    }
     const createdRecords = [];
    for (const resin of resinArr) {
      connection = await database.getConnection();
      const result = await connection.execute(
        `SELECT material_properties_seq.NEXTVAL FROM DUAL`
      );
      const nextId = result.rows[0][0];
      const bindParams = {
        id: nextId,
        name: data.name,
        request_date: data.request_date ? new Date(data.request_date) : null,
        handler: data.handler,
        status: data.status || 'Pending',
        complete_date: data.complete_date ? new Date(data.complete_date) : null,
        vendor: data.vendor,
        family: data.family,
        glass_style: data.glass_style,
        resin_percentage: data.resin_percentage,
        rav_thickness: data.rav_thickness,
        preference_class: data.preference_class,
        use_type: data.use_type,
        tg_min: data.tg_min,
        tg_max: data.tg_max,
        dk_01g: data.dk_01g,
        df_01g: data.df_01g,
        dk_0_001ghz: data.dk_0_001ghz,
        df_0_001ghz: data.df_0_001ghz,
        dk_0_01ghz: data.dk_0_01ghz,
        df_0_01ghz: data.df_0_01ghz,
        dk_0_02ghz: data.dk_0_02ghz,
        df_0_02ghz: data.df_0_02ghz,
        dk_2ghz: data.dk_2ghz,
        df_2ghz: data.df_2ghz,
        dk_2_45ghz: data.dk_2_45ghz,
        df_2_45ghz: data.df_2_45ghz,
        dk_3ghz: data.dk_3ghz,
        df_3ghz: data.df_3ghz,
        dk_4ghz: data.dk_4ghz,
        df_4ghz: data.df_4ghz,
        dk_5ghz: data.dk_5ghz,
        df_5ghz: data.df_5ghz,
        dk_6ghz: data.dk_6ghz,
        df_6ghz: data.df_6ghz,
        dk_7ghz: data.dk_7ghz,
        df_7ghz: data.df_7ghz,
        dk_8ghz: data.dk_8ghz,
        df_8ghz: data.df_8ghz,
        dk_9ghz: data.dk_9ghz,
        df_9ghz: data.df_9ghz,
        dk_10ghz: data.dk_10ghz,
        df_10ghz: data.df_10ghz,
        dk_15ghz: data.dk_15ghz,
        df_15ghz: data.df_15ghz,
        dk_16ghz: data.dk_16ghz,
        df_16ghz: data.df_16ghz,
        dk_20ghz: data.dk_20ghz,
        df_20ghz: data.df_20ghz,
        dk_25ghz: data.dk_25ghz,
        df_25ghz: data.df_25ghz,
        is_hf: data.is_hf || 'FALSE',
        data_source: data.data_source,
        filename: data.filename,
        is_deleted: 0,
      };
      await connection.execute(
        `INSERT INTO material_properties (
    id, name, request_date, handler, 
    status, complete_date, vendor, family,
    glass_style,resin_percentage, rav_thickness, 
    preference_class, use_type, tg_min, tg_max, 
    DK_01G, DF_01G,
    DK_0_001GHZ_, DF_0_001GHZ_,
    DK_0_01GHZ_, DF_0_01GHZ_,
    DK_0_02GHZ_, DF_0_02GHZ_,
    DK_2GHZ_, DF_2GHZ_,
    DK_2_45GHZ_, DF_2_45GHZ_,
    DK_3GHZ_, DF_3GHZ_,
    DK_4GHZ_, DF_4GHZ_,
    DK_5GHZ_, DF_5GHZ_,
    DK_6GHZ_, DF_6GHZ_,
    DK_7GHZ_, DF_7GHZ_,
    DK_8GHZ_, DF_8GHZ_,
    DK_9GHZ_, DF_9GHZ_,
    DK_10GHZ_, DF_10GHZ_,
    DK_15GHZ_, DF_15GHZ_,
    DK_16GHZ_, DF_16GHZ_,
    DK_20GHZ_, DF_20GHZ_,
    DK_25GHZ_, DF_25GHZ_,
    is_hf, data_source, filename, is_deleted
  ) VALUES (
    :id, :name, :request_date, :handler,
    :status, :complete_date, :vendor, :family,
    :glass_style,:resin_percentage, :rav_thickness, :preference_class, :use_type, 
    :tg_min, :tg_max, 
    :dk_01g, :df_01g,
    :dk_0_001ghz, :df_0_001ghz,
    :dk_0_01ghz, :df_0_01ghz,
    :dk_0_02ghz, :df_0_02ghz,
    :dk_2ghz, :df_2ghz,
    :dk_2_45ghz, :df_2_45ghz,
    :dk_3ghz, :df_3ghz,
    :dk_4ghz, :df_4ghz,
    :dk_5ghz, :df_5ghz,
    :dk_6ghz, :df_6ghz,
    :dk_7ghz, :df_7ghz,
    :dk_8ghz, :df_8ghz,
    :dk_9ghz, :df_9ghz,
    :dk_10ghz, :df_10ghz,
    :dk_15ghz, :df_15ghz,
    :dk_16ghz, :df_16ghz,
    :dk_20ghz, :df_20ghz,
    :dk_25ghz, :df_25ghz,
    :is_hf, :data_source, :filename, :is_deleted
  )`,
        bindParams,
        { autoCommit: true }
      );
      createdRecords.push({
        id: nextId,
        ...bindParams
      });
      await connection.close();
    }
    res.status(201).json({
      success: true,
      message: 'Material pp(s) created successfully',
      data: createdRecords
    });
  } catch (error) {
    console.error('Error creating material pp:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create material pp',
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

    if (updateData.status && !['Approve', 'Cancel', 'Pending'].includes(updateData.status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    if (updateData.is_hf && !['TRUE', 'FALSE'].includes(updateData.is_hf)) {
      return res.status(400).json({ message: 'Giá trị is_hf không hợp lệ' });
    }
    const updateFields = [];
    const bindParams = { id };
    const columnMapping = {
      id: 'ID',
      name: 'name',
      request_date: 'request_date',
      handler: 'handler',
      status: 'status',
      complete_date: 'complete_date',
      vendor: 'vendor',
      family: 'family',
      glass_style: 'glass_style',
      resin_percentage: 'resin_percentage',
      rav_thickness: 'rav_thickness',
      preference_class: 'preference_class',
      use_type: 'use_type',
      tg_min: 'tg_min',
      tg_max: 'tg_max',
      dk_01g: 'DK_01G',
      df_01g: 'DF_01G',
      dk_0_001ghz: 'DK_0_001GHZ_',
      df_0_001ghz: 'DF_0_001GHZ_',
      dk_0_01ghz: 'DK_0_01GHZ_',
      df_0_01ghz: 'DF_0_01GHZ_',
      dk_0_02ghz: 'DK_0_02GHZ_',
      df_0_02ghz: 'DF_0_02GHZ_',
      dk_2ghz: 'DK_2GHZ_',
      df_2ghz: 'DF_2GHZ_',
      dk_2_45ghz: 'DK_2_45GHZ_',
      df_2_45ghz: 'DF_2_45GHZ_',
      dk_3ghz: 'DK_3GHZ_',
      df_3ghz: 'DF_3GHZ_',
      dk_4ghz: 'DK_4GHZ_',
      df_4ghz: 'DF_4GHZ_',
      dk_5ghz: 'DK_5GHZ_',
      df_5ghz: 'DF_5GHZ_',
      dk_6ghz: 'DK_6GHZ_',
      df_6ghz: 'DF_6GHZ_',
      dk_7ghz: 'DK_7GHZ_',
      df_7ghz: 'DF_7GHZ_',
      dk_8ghz: 'DK_8GHZ_',
      df_8ghz: 'DF_8GHZ_',
      dk_9ghz: 'DK_9GHZ_',
      df_9ghz: 'DF_9GHZ_',
      dk_10ghz: 'DK_10GHZ_',
      df_10ghz: 'DF_10GHZ_',
      dk_15ghz: 'DK_15GHZ_',
      df_15ghz: 'DF_15GHZ_',
      dk_16ghz: 'DK_16GHZ_',
      df_16ghz: 'DF_16GHZ_',
      dk_20ghz: 'DK_20GHZ_',
      df_20ghz: 'DF_20GHZ_',
      dk_25ghz: 'DK_25GHZ_',
      df_25ghz: 'DF_25GHZ_',
      is_hf: 'is_hf',
      data_source: 'data_source',
      filename: 'filename'
    };
    const safeNumber = (value, precision = null) => {
      if (value === '' || value === null || value === undefined) {
        return null;
      }
      const cleanValue = String(value).replace(/[^\d.-]/g, '');
      const num = precision !== null ? parseFloat(cleanValue) : parseInt(cleanValue, 10);
      return isNaN(num) ? null : num;
    };

    const integerFields = ['id', 'resin_percentage', 'preference_class', 'tg_min', 'tg_max'];
    const numericPrecisionFields = [
      'dk_01g', 'df_01g',
      'dk_0_001ghz', 'df_0_001ghz',
      'dk_0_01ghz', 'df_0_01ghz',
      'dk_0_02ghz', 'df_0_02ghz',
      'dk_2ghz', 'df_2ghz',
      'dk_2_45ghz', 'df_2_45ghz',
      'dk_3ghz', 'df_3ghz',
      'dk_4ghz', 'df_4ghz',
      'dk_5ghz', 'df_5ghz',
      'dk_6ghz', 'df_6ghz',
      'dk_7ghz', 'df_7ghz',
      'dk_8ghz', 'df_8ghz',
      'dk_9ghz', 'df_9ghz',
      'dk_10ghz', 'df_10ghz',
      'dk_15ghz', 'df_15ghz',
      'dk_16ghz', 'df_16ghz',
      'dk_20ghz', 'df_20ghz',
      'dk_25ghz', 'df_25ghz',
    ];

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && columnMapping[key]) {
        const columnName = columnMapping[key];
        updateFields.push(`${columnName} = :${key}`);
        if (key === 'request_date' || key === 'complete_date') {
          bindParams[key] = updateData[key] ? new Date(updateData[key]) : null;
        } else if (numericPrecisionFields.includes(key)) {
          bindParams[key] = safeNumber(updateData[key], 4);
          console.log(`Converting ${key} from`, updateData[key], 'to', bindParams[key]);
        } else if (integerFields.includes(key)) {
          bindParams[key] = safeNumber(updateData[key]);
          console.log(`Converting ${key} from`, updateData[key], 'to', bindParams[key]);
        } else {
          bindParams[key] = updateData[key] || null;
        }
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu cập nhật' });
    } const updateQuery = `
      UPDATE material_properties 
      SET ${updateFields.join(', ')}
      WHERE id = :id
    `;
    const result = await connection.execute(updateQuery, bindParams, { autoCommit: true });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }
    const updatedRecord = await connection.execute(
      `SELECT * FROM material_properties WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      message: 'Cập nhật thành công',
      data: updatedRecord.rows[0]
    });
  } catch (err) {
    console.error('Error updating material properties:', err);
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
      `UPDATE material_properties SET is_deleted = 1 WHERE id = :id`,
      { id },
      { autoCommit: true }
    );
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
      'VENDOR','FAMILY','PREPREG_COUNT','NOMINAL_THICKNESS','SPEC_THICKNESS',
      'PREFERENCE_CLASS','USE_TYPE','RIGID','TOP_FOIL_CU_WEIGHT','BOT_FOIL_CU_WEIGHT',
      'TG_MIN','TG_MAX','CENTER_GLASS',
      null, null, null, null, null, 'DK_01G','DF_01G','DK_0_001GHZ','DF_0_001GHZ','DK_0_01GHZ','DF_0_01GHZ',
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
