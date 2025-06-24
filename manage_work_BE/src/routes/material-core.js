const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip'); // Built-in alternative: archiver/yauzl

const { authenticateToken, checkEditPermission } = require('../middleware/auth');

// Lấy danh sách material core
router.get('/list', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
      const result = await connection.execute(      `SELECT 
        id,
        requester_name,
        request_date,
        handler,
        status,
        complete_date,
        vendor,
        family,
        prepreg_count,
        nominal_thickness,
        spec_thickness,
        preference_class,
        use_type,
        rigid,
        top_foil_cu_weight,
        bot_foil_cu_weight,
        tg_min,
        tg_max,
        center_glass,
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
        DK_5GHZ_ as dk_5ghz,
        DF_5GHZ_ as df_5ghz,
        DK_5GHZ__ as dk_5ghz_2,
        DF_5GHZ__ as df_5ghz_2,
        DK_8GHZ_ as dk_8ghz,
        DF_8GHZ_ as df_8ghz,
        DK_10GHZ_ as dk_10ghz,
        DF_10GHZ_ as df_10ghz,
        DK_15GHZ_ as dk_15ghz,
        DF_15GHZ_ as df_15ghz,
        DK_16GHZ_ as dk_16ghz,
        DF_16GHZ_ as df_16ghz,
        DK_20GHZ_ as dk_20ghz,
        DF_20GHZ_ as df_20ghz,
        DK_01G as dk_01g,
        DF_01G as df_01g,
        DK_25GHZ_ as dk_25ghz,
        DF_25GHZ_ as df_25ghz,
        DK_30GHZ_ as dk_30ghz,
        DF_30GHZ_ as df_30ghz,
        DK_35GHZ__ as dk_35ghz,
        DF_35GHZ__ as df_35ghz,
        DK_40GHZ_ as dk_40ghz,
        DF_40GHZ_ as df_40ghz,
        DK_45GHZ_ as dk_45ghz,
        DF_45GHZ_ as df_45ghz,
        DK_50GHZ_ as dk_50ghz,
        DF_50GHZ_ as df_50ghz,
        DK_55GHZ_ as dk_55ghz,
        DF_55GHZ_ as df_55ghz,
        is_hf,
        data_source,
        filename
       FROM material_core
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
    console.log('MaterialCore create req.body:', JSON.stringify(data));
    // Đảm bảo cả hai trường là mảng và loại bỏ phần tử rỗng/null/undefined
    let topArr = Array.isArray(data.top_foil_cu_weight) ? data.top_foil_cu_weight : [data.top_foil_cu_weight];
    let botArr = Array.isArray(data.bot_foil_cu_weight) ? data.bot_foil_cu_weight : [data.bot_foil_cu_weight];
    topArr = topArr.filter(x => x !== undefined && x !== null && x !== '');
    botArr = botArr.filter(x => x !== undefined && x !== null && x !== '');
    if (topArr.length !== botArr.length) {
      return res.status(400).json({
        success: false,
        message: 'Số lượng giá trị Top/Bot Foil Cu Weight phải bằng nhau.'
      });
    }
    const createdRecords = [];
    for (let i = 0; i < topArr.length; i++) {
      connection = await database.getConnection();
      // Get next ID from sequence
      const result = await connection.execute(
        `SELECT material_core_seq.NEXTVAL FROM DUAL`
      );
      const nextId = result.rows[0][0];
      const bindParams = {
        id: nextId,
        requester_name: data.requester_name,
        request_date: data.request_date ? new Date(data.request_date) : null,
        handler: data.handler,
        status: data.status || 'Pending',
        complete_date: data.complete_date ? new Date(data.complete_date) : null,
        vendor: data.vendor,
        family: data.family,
        prepreg_count: data.prepreg_count,
        nominal_thickness: data.nominal_thickness,
        spec_thickness: data.spec_thickness,
        preference_class: data.preference_class,
        use_type: data.use_type,
        rigid: data.rigid || 'FALSE',
        top_foil_cu_weight: topArr[i],
        bot_foil_cu_weight: botArr[i],
        tg_min: data.tg_min,
        tg_max: data.tg_max,
        center_glass: data.center_glass,
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
        dk_5ghz: data.dk_5ghz,
        df_5ghz: data.df_5ghz,
        dk_5ghz_2: data.dk_5ghz_2,
        df_5ghz_2: data.df_5ghz_2,
        dk_8ghz: data.dk_8ghz,
        df_8ghz: data.df_8ghz,
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
        dk_30ghz: data.dk_30ghz,
        df_30ghz: data.df_30ghz,
        dk_35ghz: data.dk_35ghz,
        df_35ghz: data.df_35ghz,
        dk_40ghz: data.dk_40ghz,
        df_40ghz: data.df_40ghz,
        dk_45ghz: data.dk_45ghz,
        df_45ghz: data.df_45ghz,
        dk_50ghz: data.dk_50ghz,
        df_50ghz: data.df_50ghz,
        dk_55ghz: data.dk_55ghz,
        df_55ghz: data.df_55ghz,
        is_hf: data.is_hf || 'FALSE',
        data_source: data.data_source,
        filename: data.filename,
        is_deleted: 0,
      };
      await connection.execute(
        `INSERT INTO material_core (
          id, requester_name, request_date, handler, 
          status, complete_date, vendor, family,
          prepreg_count, nominal_thickness, spec_thickness,
          preference_class, use_type, rigid, top_foil_cu_weight,
          bot_foil_cu_weight, tg_min, tg_max, center_glass,
          DK_01G, DF_01G,
          DK_0_001GHZ_, DF_0_001GHZ_,
          DK_0_01GHZ_, DF_0_01GHZ_,
          DK_0_02GHZ_, DF_0_02GHZ_,
          DK_2GHZ_, DF_2GHZ_,
          DK_2_45GHZ_, DF_2_45GHZ_,
          DK_3GHZ_, DF_3GHZ_,
          DK_5GHZ_, DF_5GHZ_,
          DK_5GHZ__, DF_5GHZ__,
          DK_8GHZ_, DF_8GHZ_,
          DK_10GHZ_, DF_10GHZ_,
          DK_15GHZ_, DF_15GHZ_,
          DK_16GHZ_, DF_16GHZ_,
          DK_20GHZ_, DF_20GHZ_,
          DK_25GHZ_, DF_25GHZ_,
          DK_30GHZ_, DF_30GHZ_,
          DK_35GHZ__, DF_35GHZ__,
          DK_40GHZ_, DF_40GHZ_,
          DK_45GHZ_, DF_45GHZ_,
          DK_50GHZ_, DF_50GHZ_,
          DK_55GHZ_, DF_55GHZ_,
          is_hf, data_source, filename, is_deleted
        ) VALUES (
          :id, :requester_name, :request_date, :handler,
          :status, :complete_date, :vendor, :family,
          :prepreg_count, :nominal_thickness, :spec_thickness,
          :preference_class, :use_type, :rigid, :top_foil_cu_weight,
          :bot_foil_cu_weight, :tg_min, :tg_max, :center_glass,
          :dk_01g, :df_01g,
          :dk_0_001ghz, :df_0_001ghz,
          :dk_0_01ghz, :df_0_01ghz,
          :dk_0_02ghz, :df_0_02ghz,
          :dk_2ghz, :df_2ghz,
          :dk_2_45ghz, :df_2_45ghz,
          :dk_3ghz, :df_3ghz,
          :dk_5ghz, :df_5ghz,
          :dk_5ghz_2, :df_5ghz_2,
          :dk_8ghz, :df_8ghz,
          :dk_10ghz, :df_10ghz,
          :dk_15ghz, :df_15ghz,
          :dk_16ghz, :df_16ghz,
          :dk_20ghz, :df_20ghz,
          :dk_25ghz, :df_25ghz,
          :dk_30ghz, :df_30ghz,
          :dk_35ghz, :df_35ghz,
          :dk_40ghz, :df_40ghz,
          :dk_45ghz, :df_45ghz,
          :dk_50ghz, :df_50ghz,
          :dk_55ghz, :df_55ghz,
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
      message: 'Material core(s) created successfully',
      data: createdRecords
    });
  } catch (error) {
    console.error('Error creating material core:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create material core',
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
    if (updateData.top_foil_cu_weight) {
      if (Array.isArray(updateData.top_foil_cu_weight)) {
        updateData.top_foil_cu_weight = updateData.top_foil_cu_weight[0];
      }
      
      if (!['L', 'H', '1', '2'].includes(updateData.top_foil_cu_weight)) {
        return res.status(400).json({ message: 'Giá trị top_foil_cu_weight không hợp lệ' });
      }
    }

    if (updateData.is_hf && !['TRUE', 'FALSE'].includes(updateData.is_hf)) {
      return res.status(400).json({ message: 'Giá trị is_hf không hợp lệ' });
    }   
    const updateFields = [];
    const bindParams = { id };
    const columnMapping = {
      id: 'ID',
      requester_name: 'requester_name',
      request_date: 'request_date',
      handler: 'handler',
      status: 'status',
      complete_date: 'complete_date',
      vendor: 'vendor',
      family: 'family',
      prepreg_count: 'prepreg_count',
      nominal_thickness: 'nominal_thickness',
      spec_thickness: 'spec_thickness',
      preference_class: 'preference_class',
      use_type: 'use_type',
      rigid: 'rigid',
      top_foil_cu_weight: 'top_foil_cu_weight',
      bot_foil_cu_weight: 'bot_foil_cu_weight',
      tg_min: 'tg_min',
      tg_max: 'tg_max',
      center_glass: 'center_glass',
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
      dk_5ghz: 'DK_5GHZ_',
      df_5ghz: 'DF_5GHZ_',
      dk_5ghz_2: 'DK_5GHZ__',
      df_5ghz_2: 'DF_5GHZ__',
      dk_8ghz: 'DK_8GHZ_',
      df_8ghz: 'DF_8GHZ_',
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
      dk_30ghz: 'DK_30GHZ_',
      df_30ghz: 'DF_30GHZ_',
      dk_35ghz: 'DK_35GHZ__',
      df_35ghz: 'DF_35GHZ__',
      dk_40ghz: 'DK_40GHZ_',
      df_40ghz: 'DF_40GHZ_',
      dk_45ghz: 'DK_45GHZ_',
      df_45ghz: 'DF_45GHZ_',
      dk_50ghz: 'DK_50GHZ_',
      df_50ghz: 'DF_50GHZ_',
      dk_55ghz: 'DK_55GHZ_',
      df_55ghz: 'DF_55GHZ_',
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

    const integerFields = ['id', 'prepreg_count', 'preference_class', 'tg_min', 'tg_max'];
    const numericPrecisionFields = [
      'nominal_thickness', 'spec_thickness',  
      'dk_01g', 'df_01g',                    
      'dk_0_001ghz', 'df_0_001ghz',         
      'dk_0_01ghz', 'df_0_01ghz',
      'dk_0_02ghz', 'df_0_02ghz',
      'dk_2ghz', 'df_2ghz',
      'dk_2_45ghz', 'df_2_45ghz',
      'dk_3ghz', 'df_3ghz',
      'dk_5ghz', 'df_5ghz',
      'dk_5ghz_2', 'df_5ghz_2',
      'dk_8ghz', 'df_8ghz',
      'dk_10ghz', 'df_10ghz',
      'dk_15ghz', 'df_15ghz',
      'dk_16ghz', 'df_16ghz',
      'dk_20ghz', 'df_20ghz',
      'dk_25ghz', 'df_25ghz',
      'dk_30ghz', 'df_30ghz',
      'dk_35ghz', 'df_35ghz',
      'dk_40ghz', 'df_40ghz',
      'dk_45ghz', 'df_45ghz',
      'dk_50ghz', 'df_50ghz',
      'dk_55ghz', 'df_55ghz'
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
    }    const updateQuery = `
      UPDATE material_core 
      SET ${updateFields.join(', ')}
      WHERE id = :id
    `;
    const result = await connection.execute(updateQuery, bindParams, { autoCommit: true });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }
    const updatedRecord = await connection.execute(
      `SELECT * FROM material_core WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      message: 'Cập nhật thành công',
      data: updatedRecord.rows[0]
    });
  } catch (err) {
    console.error('Error updating material core:', err);
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
      `UPDATE material_core SET is_deleted = 1 WHERE id = :id`,
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

async function createBackupTemplate() {
  console.log('Creating backup template...');
  
  const workbook = new ExcelJS.Workbook();
  
  // Tạo đủ 5 sheets để đảm bảo sheet[4] tồn tại
  for (let i = 0; i < 5; i++) {
    const worksheet = workbook.addWorksheet(`Sheet${i + 1}`);
    
    if (i === 4) { // Sheet thứ 5 (index 4)
      // Tạo title row
      worksheet.getCell('A1').value = 'Material Core Export Template';
      worksheet.getCell('A1').font = { bold: true, size: 14 };
      
      // Tạo header row tại row 2
      const headers = [
        'STT', 'ID', 'Name', 'Description', 'Type', // A-E
        'VENDOR', 'FAMILY', 'PREPREG_COUNT', 'NOMINAL_THICKNESS', 'SPEC_THICKNESS', // F-J
        'PREFERENCE_CLASS', 'USE_TYPE', 'RIGID', 'TOP_FOIL_CU_WEIGHT', 'BOT_FOIL_CU_WEIGHT', // K-O
        'TG_MIN', 'TG_MAX', 'CENTER_GLASS', 'DK_01G', 'DF_01G', // P-T
        'DK_0_001GHZ', 'DF_0_001GHZ', 'DK_0_01GHZ', 'DF_0_01GHZ', 'DK_0_02GHZ', // U-Y
        'DF_0_02GHZ', 'DK_2GHZ', 'DF_2GHZ', 'DK_2_45GHZ', 'DF_2_45GHZ', // Z-AD
        'DK_3GHZ', 'DF_3GHZ', 'DK_5GHZ', 'DF_5GHZ', 'DK_5GHZ_2', // AE-AI
        'DF_5GHZ_2', 'DK_8GHZ', 'DF_8GHZ', 'DK_10GHZ', 'DF_10GHZ', // AJ-AN
        'DK_15GHZ', 'DF_15GHZ', 'DK_16GHZ', 'DF_16GHZ', 'DK_20GHZ', // AO-AS
        'DF_20GHZ', 'DK_25GHZ', 'DF_25GHZ', 'DK_30GHZ', 'DF_30GHZ', // AT-AX
        'DK_35GHZ', 'DF_35GHZ', 'DK_40GHZ', 'DF_40GHZ', 'DK_45GHZ', // AY-BC
        'DF_45GHZ', 'DK_50GHZ', 'DF_50GHZ', 'DK_55GHZ', 'DF_55GHZ' // BD-BH
      ];
      
      // Ghi headers vào row 2
      headers.forEach((header, index) => {
        const cell = worksheet.getCell(2, index + 1);
        cell.value = header;
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6E6FA' } // Light purple
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      
      // Thiết lập độ rộng cột
      worksheet.getColumn('A').width = 5;  // STT
      worksheet.getColumn('B').width = 10; // ID
      worksheet.getColumn('C').width = 20; // Name
      worksheet.getColumn('D').width = 30; // Description
      worksheet.getColumn('E').width = 15; // Type
      
      // Các cột data chính (F-BH)
      for (let col = 6; col <= headers.length; col++) {
        worksheet.getColumn(col).width = 12;
      }
      
      // Freeze panes
      worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
      
      // Thêm một vài dòng mẫu để test
      worksheet.getCell('A3').value = 1;
      worksheet.getCell('B3').value = 'SAMPLE001';
      worksheet.getCell('C3').value = 'Sample Material';
      worksheet.getCell('D3').value = 'This is a sample row';
      worksheet.getCell('E3').value = 'Test';
    }
  }
  
  return workbook;
}

// Hàm kiểm tra và sửa lỗi template
async function validateAndFixTemplate(originalPath) {
  const backupPath = originalPath.replace(/\.(xlsx|xlsm)$/, '_backup.$1');
  
  try {
    // Thử đọc file gốc
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(originalPath);
    
    // Kiểm tra các điều kiện cần thiết
    const worksheet = workbook.worksheets[4];
    if (!worksheet) {
      throw new Error('Sheet thứ 5 không tồn tại');
    }
    
    // Kiểm tra worksheet có thể ghi được không
    try {
      worksheet.getCell('A1').value = 'Test';
      await workbook.xlsx.writeBuffer(); // Test write
      console.log('Template file is valid');
      return { workbook, isFixed: false, path: originalPath };
    } catch (writeError) {
      throw new Error('Cannot write to worksheet: ' + writeError.message);
    }
    
  } catch (error) {
    console.warn('Template validation failed:', error.message);
    console.log('Creating backup template...');
    
    try {
      // Tạo backup template
      const backupWorkbook = await createBackupTemplate();
      
      // Lưu backup template
      await backupWorkbook.xlsx.writeFile(backupPath);
      console.log(`Backup template created: ${backupPath}`);
      
      return { workbook: backupWorkbook, isFixed: true, path: backupPath };
    } catch (backupError) {
      console.error('Failed to create backup template:', backupError);
      throw new Error('Cannot create backup template: ' + backupError.message);
    }
  }
}
// Export route với xử lý lỗi thủ công
router.post('/export', async (req, res) => {
  try {
    const data = req.body.data;
    
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ message: 'Invalid data format' });
    }

    const originalTemplatePath = path.join(__dirname, '../public/template/TemplateMaterial.xlsm');
    let templatePath = originalTemplatePath;
    
    // Kiểm tra file template tồn tại
    if (!fs.existsSync(templatePath)) {
      throw new Error('Template file not found');
    }

    let workbook = new ExcelJS.Workbook();
    let useFixedTemplate = false;
    
    try {
      // Thử đọc file template gốc
      await workbook.xlsx.readFile(templatePath);
      
      // Kiểm tra sheet thứ 5
      if (!workbook.worksheets[4]) {
        throw new Error('Sheet 5 not found');
      }
      
    } catch (readError) {
      console.log('Template read failed, attempting manual fix...');
      
      try {
        // Sử dụng hàm sửa lỗi thủ công
        const fixedTemplatePath = await fixCorruptedExcelFile(originalTemplatePath);
        
        if (fixedTemplatePath !== originalTemplatePath) {
          templatePath = fixedTemplatePath;
          useFixedTemplate = true;
        }
        
        // Thử đọc lại file đã sửa
        workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(templatePath);
        
        if (!workbook.worksheets[4]) {
          throw new Error('Sheet 5 still not found after fix');
        }
        
        console.log('Successfully loaded fixed template');
        
      } catch (fixError) {
        console.error('Manual fix failed, creating new template...');
        
        // Tạo workbook hoàn toàn mới
        workbook = await createCleanTemplate();
      }
    }

    // Xử lý dữ liệu như bình thường
    const worksheet = workbook.worksheets[4];
    const startRow = 3;
    
    const safeCell = (v) => {
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    };

    // Ghi dữ liệu vào worksheet
    data.forEach((row, idx) => {
      try {
        const excelRow = worksheet.getRow(startRow + idx);
        
        // Mapping dữ liệu (giữ nguyên như code gốc)
        excelRow.getCell(6).value = safeCell(row.VENDOR || row.vendor);
        excelRow.getCell(7).value = safeCell(row.FAMILY || row.family);
        excelRow.getCell(8).value = safeCell(row.PREPREG_COUNT || row.prepreg_count);
        excelRow.getCell(9).value = safeCell(row.NOMINAL_THICKNESS || row.nominal_thickness);
        excelRow.getCell(10).value = safeCell(row.SPEC_THICKNESS || row.spec_thickness);
        excelRow.getCell(11).value = safeCell(row.PREFERENCE_CLASS || row.preference_class);
        excelRow.getCell(12).value = safeCell(row.USE_TYPE || row.use_type);
        excelRow.getCell(13).value = safeCell(row.RIGID || row.rigid);
        excelRow.getCell(14).value = safeCell(row.TOP_FOIL_CU_WEIGHT || row.top_foil_cu_weight);
        excelRow.getCell(15).value = safeCell(row.BOT_FOIL_CU_WEIGHT || row.bot_foil_cu_weight);
        excelRow.getCell(16).value = safeCell(row.TG_MIN || row.tg_min);
        excelRow.getCell(17).value = safeCell(row.TG_MAX || row.tg_max);
        excelRow.getCell(18).value = safeCell(row.CENTER_GLASS || row.center_glass);
        excelRow.getCell(19).value = safeCell(row.DK_01G || row.dk_01g);
        excelRow.getCell(20).value = safeCell(row.DF_01G || row.df_01g);
        excelRow.getCell(21).value = safeCell(row.DK_0_001GHZ || row.dk_0_001ghz);
        excelRow.getCell(22).value = safeCell(row.DF_0_001GHZ || row.df_0_001ghz);
        excelRow.getCell(23).value = safeCell(row.DK_0_01GHZ || row.dk_0_01ghz);
        excelRow.getCell(24).value = safeCell(row.DF_0_01GHZ || row.df_0_01ghz);
        excelRow.getCell(25).value = safeCell(row.DK_0_02GHZ || row.dk_0_02ghz);
        excelRow.getCell(26).value = safeCell(row.DF_0_02GHZ || row.df_0_02ghz);
        excelRow.getCell(27).value = safeCell(row.DK_2GHZ || row.dk_2ghz);
        excelRow.getCell(28).value = safeCell(row.DF_2GHZ || row.df_2ghz);
        excelRow.getCell(29).value = safeCell(row.DK_2_45GHZ || row.dk_2_45ghz);
        excelRow.getCell(30).value = safeCell(row.DF_2_45GHZ || row.df_2_45ghz);
        excelRow.getCell(31).value = safeCell(row.DK_3GHZ || row.dk_3ghz);
        excelRow.getCell(32).value = safeCell(row.DF_3GHZ || row.df_3ghz);
        excelRow.getCell(33).value = safeCell(row.DK_5GHZ || row.dk_5ghz);
        excelRow.getCell(34).value = safeCell(row.DF_5GHZ || row.df_5ghz);
        excelRow.getCell(35).value = safeCell(row.DK_5GHZ__ || row.dk_5ghz_2);
        excelRow.getCell(36).value = safeCell(row.DF_5GHZ__ || row.df_5ghz_2);
        excelRow.getCell(37).value = safeCell(row.DK_8GHZ || row.dk_8ghz);
        excelRow.getCell(38).value = safeCell(row.DF_8GHZ || row.df_8ghz);
        excelRow.getCell(39).value = safeCell(row.DK_10GHZ || row.dk_10ghz);
        excelRow.getCell(40).value = safeCell(row.DF_10GHZ || row.df_10ghz);
        excelRow.getCell(41).value = safeCell(row.DK_15GHZ || row.dk_15ghz);
        excelRow.getCell(42).value = safeCell(row.DF_15GHZ || row.df_15ghz);
        excelRow.getCell(43).value = safeCell(row.DK_16GHZ || row.dk_16ghz);
        excelRow.getCell(44).value = safeCell(row.DF_16GHZ || row.df_16ghz);
        excelRow.getCell(45).value = safeCell(row.DK_20GHZ || row.dk_20ghz);
        excelRow.getCell(46).value = safeCell(row.DF_20GHZ || row.df_20ghz);
        excelRow.getCell(47).value = safeCell(row.DK_25GHZ || row.dk_25ghz);
        excelRow.getCell(48).value = safeCell(row.DF_25GHZ || row.df_25ghz);
        excelRow.getCell(49).value = safeCell(row.DK_30GHZ || row.dk_30ghz);
        excelRow.getCell(50).value = safeCell(row.DF_30GHZ || row.df_30ghz);
        excelRow.getCell(51).value = safeCell(row.DK_35GHZ__ || row.dk_35ghz);
        excelRow.getCell(52).value = safeCell(row.DF_35GHZ__ || row.df_35ghz);
        excelRow.getCell(53).value = safeCell(row.DK_40GHZ || row.dk_40ghz);
        excelRow.getCell(54).value = safeCell(row.DF_40GHZ || row.df_40ghz);
        excelRow.getCell(55).value = safeCell(row.DK_45GHZ || row.dk_45ghz);
        excelRow.getCell(56).value = safeCell(row.DF_45GHZ || row.df_45ghz);
        excelRow.getCell(57).value = safeCell(row.DK_50GHZ || row.dk_50ghz);
        excelRow.getCell(58).value = safeCell(row.DF_50GHZ || row.df_50ghz);
        excelRow.getCell(59).value = safeCell(row.DK_55GHZ || row.dk_55ghz);
        excelRow.getCell(60).value = safeCell(row.DF_55GHZ || row.df_55ghz);
        
        excelRow.commit();
      } catch (rowError) {
        console.error(`Error processing row ${idx}:`, rowError.message);
      }
    });

    // Tạo buffer và trả về
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Cleanup: xóa file tạm nếu đã tạo
    if (useFixedTemplate && templatePath !== originalTemplatePath) {
      try {
        fs.unlinkSync(templatePath);
      } catch (cleanupError) {
        console.warn('Could not cleanup temp file:', cleanupError.message);
      }
    }
    
    const filename = useFixedTemplate ? 'MaterialCoreExport_Fixed.xlsx' : 'MaterialCoreExport.xlsm';
    const contentType = useFixedTemplate ? 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
      'application/vnd.ms-excel.sheet.macroEnabled.12';
    
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);

  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ 
      message: 'Export failed', 
      error: err.message,
      suggestion: 'Template file có thể bị lỗi. Hãy thử tạo lại template hoặc chuyển sang định dạng .xlsx'
    });
  }
});

// Hàm tạo template sạch hoàn toàn mới
async function createCleanTemplate() {
  const workbook = new ExcelJS.Workbook();
  
  // Tạo 5 sheets
  for (let i = 0; i < 5; i++) {
    const worksheet = workbook.addWorksheet(`Sheet${i + 1}`);
    
    if (i === 4) { // Sheet thứ 5
      // Tạo header row
      const headers = [
        '', '', '', '', '', // A-E trống
        'VENDOR', 'FAMILY', 'PREPREG_COUNT', 'NOMINAL_THICKNESS', 'SPEC_THICKNESS',
        'PREFERENCE_CLASS', 'USE_TYPE', 'RIGID', 'TOP_FOIL_CU_WEIGHT', 'BOT_FOIL_CU_WEIGHT',
        'TG_MIN', 'TG_MAX', 'CENTER_GLASS', 'DK_01G', 'DF_01G',
        'DK_0_001GHZ', 'DF_0_001GHZ', 'DK_0_01GHZ', 'DF_0_01GHZ', 'DK_0_02GHZ',
        'DF_0_02GHZ', 'DK_2GHZ', 'DF_2GHZ', 'DK_2_45GHZ', 'DF_2_45GHZ',
        'DK_3GHZ', 'DF_3GHZ', 'DK_5GHZ', 'DF_5GHZ', 'DK_5GHZ_2',
        'DF_5GHZ_2', 'DK_8GHZ', 'DF_8GHZ', 'DK_10GHZ', 'DF_10GHZ',
        'DK_15GHZ', 'DF_15GHZ', 'DK_16GHZ', 'DF_16GHZ', 'DK_20GHZ',
        'DF_20GHZ', 'DK_25GHZ', 'DF_25GHZ', 'DK_30GHZ', 'DF_30GHZ',
        'DK_35GHZ', 'DF_35GHZ', 'DK_40GHZ', 'DF_40GHZ', 'DK_45GHZ',
        'DF_45GHZ', 'DK_50GHZ', 'DF_50GHZ', 'DK_55GHZ', 'DF_55GHZ'
      ];
      
      headers.forEach((header, index) => {
        if (header) {
          const cell = worksheet.getCell(2, index + 1);
          cell.value = header;
          cell.font = { bold: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFCCCCCC' }
          };
        }
      });
      
      // Đặt độ rộng cột
      for (let col = 6; col <= 60; col++) {
        worksheet.getColumn(col).width = 12;
      }
    }
  }
  
  return workbook;
}

module.exports = router;
