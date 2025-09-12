const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx'); // Thêm thư viện xlsx để thao tác file .xlsm
const {
  generateCreateMaterialEmailHTML,
  generateStatusUpdateEmailHTML,
  generateMaterialChangeEmailHTML,
  sendMailMaterialPP
} = require('../helper/sendMailMaterialPP');

const AllEmails = [
  'trang.nguyenkieu@meiko-elec.com',
  'thuy.nguyen2@meiko-elec.com'
];

const {
  authenticateToken,
  checkMaterialCorePermission
} = require('../middleware/auth');
const { addHistoryPpRecord } = require('./material-pp-history');

router.get('/list', authenticateToken, checkMaterialCorePermission(['view']), async (req, res) => {
  let connection;
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const allowedPageSize = [10, 20, 50, 100];
    const validPageSize = allowedPageSize.includes(pageSize) ? pageSize : 10;
    const offset = (page - 1) * validPageSize;
    const searchConditions = [];
    const searchBindings = {};


    Object.keys(req.query).forEach(key => {
      const columnNames = ['FAMILY', 'GLASS_STYLE', 'RESIN_PERCENTAGE', 'IS_HF'];
      if (columnNames.includes(key.toUpperCase()) && req.query[key] && req.query[key].trim() !== '') {
        const fieldName = key.toUpperCase();
        const searchValue = req.query[key];
        const paramName = `SEARCH_${fieldName}`;
        searchConditions.push(`UPPER(${fieldName}) LIKE :${paramName}`);
        searchBindings[paramName] = `%${searchValue.toUpperCase()}%`;
      }

      // Xử lý search_ prefix (backward compatibility)
      if (key.startsWith('search_')) {
        const fieldName = key.replace('search_', '').toUpperCase();
        const searchValue = req.query[key];
        if (searchValue && searchValue.trim() !== '') {
          const paramName = `SEARCH_${fieldName}`;
          searchConditions.push(`UPPER(${fieldName}) LIKE :${paramName}`);
          searchBindings[paramName] = `%${searchValue.toUpperCase()}%`;
        }
      }
    });

    connection = await database.getConnection();

    // Tạo WHERE clause với điều kiện tìm kiếm
    const searchWhere = searchConditions.length > 0
      ? `AND ${searchConditions.join(' AND ')}`
      : '';

    // Query để đếm tổng số records
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM material_properties
      WHERE is_deleted = 0 ${searchWhere}
    `;

    // Xây dựng query chính với pagination
    const mainQuery = `
      SELECT * FROM (
        SELECT a.*, ROW_NUMBER() OVER (ORDER BY id DESC) as row_num FROM (
          SELECT 
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
          ${searchWhere}
        ) a
      ) WHERE row_num > :offset AND row_num <= :limit`;

    // Chuẩn bị bind parameters cho cả search và pagination
    const queryParams = {
      offset: offset,
      limit: offset + validPageSize,
      ...searchBindings // Thêm các bind parameters cho điều kiện tìm kiếm
    };

    // Thực hiện cả 2 query song song với cùng một bộ params
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countQuery, searchBindings, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute(mainQuery, queryParams, { outFormat: oracledb.OUT_FORMAT_OBJECT })
    ]);

    const totalRecords = countResult.rows[0].TOTAL;
    const totalPages = Math.ceil(totalRecords / validPageSize);

    res.json({
      data: dataResult.rows,
      pagination: {
        currentPage: page,
        pageSize: validPageSize,
        totalRecords: totalRecords,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
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
router.post('/create', authenticateToken, checkMaterialCorePermission(['create']), async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const data = req.body;
    let creatorEmail = null;
    if (req.user && req.user.email) {
      try {
        const userResult = await connection.execute(
          'SELECT email FROM users WHERE user_id = :userId AND is_deleted =0',
          { userId: req.user.userId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (userResult.rows && userResult.rows.length > 0) {
          creatorEmail = userResult.rows[0].EMAIL;
        }
      } catch (emailError) {
        console.error('Warning: Failed to fetch creator email:', emailError);
      }
    }
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
        preference_class: data.preference_class,
        use_type: data.use_type,
        pp_type: data.pp_type,
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
    glass_style, resin_percentage,
    preference_class, use_type, pp_type, tg_min, tg_max, 
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
    :glass_style,:resin_percentage, :preference_class, :use_type, :pp_type,
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
      try {
        await addHistoryPpRecord(connection, {
          materialPpId: nextId,
          actionType: 'CREATE',
          createdBy: req.user.username,
          data: {
            vendor: data.vendor,
            family: data.family,
            glass_style: data.glass_style,
            resin_percentage: data.resin_percentage,
            preference_class: data.preference_class,
            use_type: data.use_type,
            pp_type: data.pp_type,
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
            filename: data.filename
          }
        });
      } catch (historyError) {
        console.error('Warning: Failed to record history:', historyError);
        // Continue execution even if history recording fails
      }
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
    // Sử dụng setImmediate hoặc process.nextTick để chạy sau khi response đã gửi
    setImmediate(async () => {
      try {
        const emailSubject = `[Material System]📝 Tạo mới Material PP - ${data.vendor || 'N/A'} | ${data.family || 'N/A'}`;
        const emailHTML = generateCreateMaterialEmailHTML(data, createdRecords);
        let recipients = [...AllEmails];
        if (creatorEmail && !recipients.includes(creatorEmail)) {
          recipients.push(creatorEmail);
        }
        recipients = [...new Set(recipients)];

        await sendMailMaterialPP(emailSubject, emailHTML, recipients);
        console.log('Email notification sent successfully for new material creation');
      } catch (emailError) {
        console.error('Warning: Failed to send email notification:', emailError);
        // Email fail không ảnh hưởng gì vì đã trả response thành công
      }
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
  const isStatusUpdate = updateData.status && Object.keys(updateData).length <= 3;
  if (isStatusUpdate) {
    // Chỉ admin mới có thể approve/cancel
    const hasApprovePermission = checkMaterialCorePermission(['approve']);
    try {
      hasApprovePermission(req, res, () => { }); // Test permission
    } catch (error) {
      return res.status(403).json({
        message: 'Chỉ Admin mới có quyền Approve/Cancel',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }
  } else {
    // Cập nhật thông tin khác - admin và edit
    const hasEditPermission = checkMaterialCorePermission(['edit']);
    try {
      hasEditPermission(req, res, () => { }); // Test permission
    } catch (error) {
      return res.status(403).json({
        message: 'Bạn không có quyền chỉnh sửa',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }
  }
  const isOnlyStatusUpdate = updateData.status && Object.keys(updateData).length === 1;

  try {
    if (!id) {
      return res.status(400).json({
        message: 'ID không hợp lệ'
      });
    }

    connection = await database.getConnection();
    let creatorEmail = null;
    if (req.user && req.user.userId) {
      try {
        const userResult = await connection.execute(
          `SELECT email FROM users WHERE user_id = :userId AND is_deleted = 0`,
          { userId: req.user.userId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (userResult.rows.length > 0) {
          creatorEmail = userResult.rows[0].EMAIL;
        }
      } catch (userError) {
        console.error('Error fetching user email:', userError);
      }
    }
    const oldRecord = await connection.execute(
      `SELECT * FROM material_properties WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (oldRecord.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }

    const oldStatus = oldRecord.rows[0].STATUS;
    const oldRecordData = oldRecord.rows[0];
    if (updateData.status && !['Approve', 'Cancel', 'Pending'].includes(updateData.status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    if (updateData.is_hf && !['TRUE', 'FALSE'].includes(updateData.is_hf)) {
      return res.status(400).json({ message: 'Giá trị is_hf không hợp lệ' });
    }

    if (updateData.status) {
      const oldResult = await connection.execute(
        `SELECT status, vendor, family, name FROM material_properties WHERE id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

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
      preference_class: 'preference_class',
      use_type: 'use_type',
      pp_type: 'pp_type',
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
        } else if (integerFields.includes(key)) {
          bindParams[key] = safeNumber(updateData[key]);
        } else {
          bindParams[key] = updateData[key] || null;
        }
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu cập nhật' });
    }
    const updateQuery = `
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

    // ✅ SỬA: Kiểm tra và gửi email khi trạng thái thay đổi
    if (updateData.status && oldStatus && updateData.status !== oldStatus) {
      // ✅ Sử dụng setImmediate để gửi email sau khi response đã được gửi
      setImmediate(async () => {
        try {
          const materialInfo = updatedRecord.rows[0];
          const newStatus = updateData.status;


          const emailSubject = `[Material System] ✅ Đã cập nhật trạng thái Material PP - ${materialInfo.VENDOR || 'N/A'}`;
          const emailHTML = generateStatusUpdateEmailHTML(
            id,
            oldStatus,
            newStatus,
            req.user?.username || 'System',
            {
              vendor: materialInfo.VENDOR,
              family: materialInfo.FAMILY,
              name: materialInfo.NAME
            }
          );
          let recipients = [...AllEmails];
          if (creatorEmail && !recipients.includes(creatorEmail)) {
            recipients.push(creatorEmail);
          }
          recipients = [...new Set(recipients)];

          await sendMailMaterialPP(emailSubject, emailHTML);
          console.log(`✅ Email notification sent for status change: ${oldStatus} -> ${newStatus}`);
        } catch (emailError) {
          console.error('❌ Warning: Failed to send status update email:', emailError);
        }
      });
    }

    // Ghi lại lịch sử
    await addHistoryPpRecord(connection, {
      materialPpId: id,
      actionType: 'UPDATE',
      data: updateData,
      createdBy: req.user.username
    });
    if (oldStatus === 'Approve' && !isOnlyStatusUpdate) {
      setImmediate(async () => {
        try {
          // So sánh các giá trị để tìm ra thay đổi
          const changes = [];
          const fieldLabels = {
            name: 'Người yêu cầu',
            request_date: 'Ngày yêu cầu',
            handler: 'Người xử lý',
            vendor: 'vendor',
            family: 'family',
            glass_style: 'glass_style',
            resin_percentage: 'resin_percentage',
            preference_class: 'preference_class',
            use_type: 'use_type',
            pp_type: 'pp_type',
            tg_min: 'tg_min',
            tg_max: 'tg_max',
            dk_01g: 'DK 01G',
            df_01g: 'DF 01G',
            dk_0_001ghz: 'DK 0.001GHz',
            df_0_001ghz: 'DF 0.001GHz',
            dk_0_01ghz: 'DK 0.01GHz',
            df_0_01ghz: 'DF 0.01GHz',
            dk_0_02ghz: 'DK 0.02GHz',
            df_0_02ghz: 'DF 0.02GHz',
            dk_2ghz: 'DK 2GHz',
            df_2ghz: 'DF 2GHz',
            dk_2_45ghz: 'DK 2.45GHz',
            df_2_45ghz: 'DF 2.45GHz',
            dk_3ghz: 'DK 3GHz',
            df_3ghz: 'DF 3GHz',
            dk_4ghz: 'DK 4GHz',
            df_4ghz: 'DF 4GHz',
            dk_5ghz: 'DK 5GHz',
            df_5ghz: 'DF 5GHz',
            dk_6ghz: 'DK 6GHz',
            df_6ghz: 'DF 6GHz',
            dk_7ghz: 'DK 7GHz',
            df_7ghz: 'DF 7GHz',
            dk_8ghz: 'DK 8GHz',
            df_8ghz: 'DF 8GHz',
            dk_9ghz: 'DK 9GHz',
            df_9ghz: 'DF 9GHz',
            dk_10ghz: 'DK 10GHz',
            df_10ghz: 'DF 10GHz',
            dk_15ghz: 'DK 15GHz',
            df_15ghz: 'DF 15GHz',
            dk_16ghz: 'DK 16GHz',
            df_16ghz: 'DF 16GHz',
            dk_20ghz: 'DK 20GHz',
            df_20ghz: 'DF 20GHz',
            dk_25ghz: 'DK 25GHz',
            df_25ghz: 'DF 25GHz',
            is_hf: 'Is HF',
            data_source: 'Data Source',
            filename: 'Filename'
          };

          Object.keys(updateData).forEach(key => {
            if (key !== 'status' && columnMapping[key]) {
              const dbColumnName = columnMapping[key].toUpperCase();
              const oldValue = oldRecordData[dbColumnName];
              const newValue = updateData[key];

              // So sánh giá trị (xử lý cho cả string và number)
              const isChanged = oldValue !== newValue &&
                !(oldValue == null && (newValue === '' || newValue == null)) &&
                !(newValue == null && (oldValue === '' || oldValue == null));

              if (isChanged) {
                changes.push({
                  field: fieldLabels[key] || key,
                  fieldKey: key,
                  oldValue: oldValue || 'Không có',
                  newValue: newValue || 'Không có'
                });
              }
            }
          });

          if (changes.length > 0) {
            console.log(`Found ${changes.length} changes for approved material ID: ${id}`);

            const emailSubject = `[Material System] ⚠️ Thay đổi dữ liệu Material PP đã được cập nhật ${VENDOR}`;
            const emailHTML = generateMaterialChangeEmailHTML(
              id,
              changes,
              req.user?.username || 'System',
              {
                vendor: oldRecordData.VENDOR,
                family: oldRecordData.FAMILY,
                name: oldRecordData.NAME,
                resinPercentage: oldRecordData.RESIN_PERCENTAGE || 'N/A',
                preferenceClass: oldRecordData.PREFERENCE_CLASS || 'N/A',
                useType: oldRecordData.USE_TYPE || 'N/A',
                ppType: oldRecordData.PP_TYPE || 'N/A',
                tgMin: oldRecordData.TG_MIN || 'N/A',

              }
            );
            let recipients = [...AllEmails];
            if (creatorEmail && !recipients.includes(creatorEmail)) {
              recipients.push(creatorEmail);
            }
            recipients = [...new Set(recipients)];

            await sendMailMaterialPP(emailSubject, emailHTML, recipients);
            console.log(`✅ Email sent successfully for material changes in approved record (ID: ${id})`);
          }

        } catch (emailError) {
          console.error('❌ Failed to send material change email:', emailError);
        }
      });
    }

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
router.delete('/delete/:id', authenticateToken, checkMaterialCorePermission(['delete']), async (req, res) => {
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
    if (result.rowsAffected > 0) {
      // Lưu lịch sử
      await addHistoryPpRecord(connection, {
        materialPpId: id,
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

router.post('/export-xlsm', authenticateToken, checkMaterialCorePermission(['view']), async (req, res) => {
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
      'VENDOR', 'FAMILY', 'GLASS_STYLE', 'RESIN_PERCENTAGE', null, null,
      'PREFERENCE_CLASS', 'USE_TYPE', 'PP_TYPE',
      'TG_MIN', 'TG_MAX', 'CENTER_GLASS', null, null, 'DK_01G', 'DF_01G', 'DK_0_001GHZ', 'DF_0_001GHZ', 'DK_0_01GHZ', 'DF_0_01GHZ',
      'DK_0_02GHZ', 'DF_0_02GHZ', 'DK_2GHZ', 'DF_2GHZ', 'DK_2_45GHZ', 'DF_2_45GHZ',
      'DK_3GHZ', 'DF_3GHZ', 'DK_4GHZ', 'DF_4GHZ', 'DK_5GHZ', 'DF_5GHZ',
      'DK_6GHZ', 'DF_6GHZ', 'DK_7GHZ', 'DF_7GHZ',
      'DK_8GHZ', 'DF_8GHZ', 'DK_9GHZ', 'DF_9GHZ', 'DK_10GHZ', 'DF_10GHZ', 'DK_15GHZ', 'DF_15GHZ',
      'DK_16GHZ', 'DF_16GHZ', 'DK_20GHZ', 'DF_20GHZ', 'DK_25GHZ', 'DF_25GHZ',
      'DK_30GHZ', 'DF_30GHZ', 'DK_35GHZ__', 'DF_35GHZ__', 'DK_40GHZ', 'DF_40GHZ',
      'DK_45GHZ', 'DF_45GHZ', 'DK_50GHZ', 'DF_50GHZ', 'DK_55GHZ', 'DF_55GHZ',
      'IS_HF', 'DATA_SOURCE'
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



router.post('/import-material-pp', authenticateToken, checkMaterialCorePermission(['create']), async (req, res) => {
  let connection;

  try {
    const { data } = req.body;
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: 'Invalid data format' });
    }

    connection = await database.getConnection();
    const createdRecords = [];

    const safeValue = (value, type = 'string') => {
      if (value === null || value === undefined || value === '') return null;

      switch (type) {
        case 'number':
          const num = parseFloat(value);
          return isNaN(num) ? null : num;
        case 'date':
          if (value instanceof Date) return value;
          const date = new Date(value);
          return isNaN(date.getTime()) ? null : date;
        default:
          return String(value).trim();
      }
    };
    const normalizeIsHf = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const normalized = String(value).trim().toUpperCase();
      return (normalized === 'TRUE' || normalized === 'FALSE') ? normalized : null;
    };

    const mapExcelKeysToDbKeys = (excelRow) => ({
      name: safeValue(excelRow.NAME),
      request_date: safeValue(excelRow.REQUEST_DATE, 'date'),
      handler: safeValue(excelRow.HANDLER),
      status: safeValue(excelRow.STATUS) || 'Pending',
      complete_date: safeValue(excelRow.COMPLETE_DATE, 'date'),
      vendor: safeValue(excelRow.VENDOR),
      family: safeValue(excelRow.FAMILY),
      glass_style: safeValue(excelRow.GLASS_STYLE),
      resin_percentage: safeValue(excelRow.RESIN_PERCENTAGE, 'number'),
      rav_thickness: safeValue(excelRow.RAV_THICKNESS),
      preference_class: safeValue(excelRow.PREFERENCE_CLASS_, 'number'),
      use_type: safeValue(excelRow.H_USE_TYPE_),
      pp_type: safeValue(excelRow.PP_TYPE_),
      tg_min: safeValue(excelRow.TG_MIN, 'number'),
      tg_max: safeValue(excelRow.TG_MAX, 'number'),
      dk_01g: safeValue(excelRow.DK_01G_, 'number'),
      df_01g: safeValue(excelRow.DF_01G_, 'number'),
      dk_0_001ghz: safeValue(excelRow['DK_0_001GHz_'], 'number'),
      df_0_001ghz: safeValue(excelRow['DF_0_001GHz_'], 'number'),
      dk_0_01ghz: safeValue(excelRow['DK_0_01MHz_'], 'number'),
      df_0_01ghz: safeValue(excelRow['DF_0_01GHz_'], 'number'),
      dk_0_02ghz: safeValue(excelRow['DK_0_02MHz_'], 'number'),
      df_0_02ghz: safeValue(excelRow['DF_0_02GHz_'], 'number'),
      dk_2ghz: safeValue(excelRow['DK_2G_'], 'number'),
      df_2ghz: safeValue(excelRow['DF_2G_'], 'number'),
      dk_2_45ghz: safeValue(excelRow['DK_2.45G_'], 'number'),
      df_2_45ghz: safeValue(excelRow['DF_2.45G_'], 'number'),
      dk_3ghz: safeValue(excelRow['DK_3G_'], 'number'),
      df_3ghz: safeValue(excelRow['DF_3G_'], 'number'),
      dk_4ghz: safeValue(excelRow['DK_4G_'], 'number'),
      df_4ghz: safeValue(excelRow['DF_4G_'], 'number'),
      dk_5ghz: safeValue(excelRow['DK_5G_'], 'number'),
      df_5ghz: safeValue(excelRow['DF_5G_'], 'number'),
      dk_6ghz: safeValue(excelRow['DK_6G_'], 'number'),
      df_6ghz: safeValue(excelRow['DF_6G_'], 'number'),
      dk_7ghz: safeValue(excelRow['DK_7G_'], 'number'),
      df_7ghz: safeValue(excelRow['DF_7G_'], 'number'),
      dk_8ghz: safeValue(excelRow['DK_8G_'], 'number'),
      df_8ghz: safeValue(excelRow['DF_8G_'], 'number'),
      dk_9ghz: safeValue(excelRow['DK_9G_'], 'number'),
      df_9ghz: safeValue(excelRow['DF_9G_'], 'number'),
      dk_10ghz: safeValue(excelRow['DK_10G_'], 'number'),
      df_10ghz: safeValue(excelRow['DF_10G_'], 'number'),
      dk_15ghz: safeValue(excelRow['DK_15G_'], 'number'),
      df_15ghz: safeValue(excelRow['DF_15G_'], 'number'),
      dk_16ghz: safeValue(excelRow['DK_16G_'], 'number'),
      df_16ghz: safeValue(excelRow['DF_16G_'], 'number'),
      dk_20ghz: safeValue(excelRow['DK_20G_'], 'number'),
      df_20ghz: safeValue(excelRow['DF_20G_'], 'number'),
      dk_25ghz: safeValue(excelRow['DK_25G_'], 'number'),
      df_25ghz: safeValue(excelRow['DF_25G_'], 'number'),
      is_hf: normalizeIsHf(excelRow.IS_HF_),
      data_source: safeValue(excelRow.DATA_SOURCE_),
      filename: safeValue(excelRow.Filename)
    });


    for (let i = 0; i < data.length; i++) {
      const item = mapExcelKeysToDbKeys(data[i]);

      const bindParams = {
        ...item
      };

      await connection.execute(
        `INSERT INTO material_properties (
          name, request_date, handler, status, complete_date,
          vendor, family, glass_style, resin_percentage, rav_thickness,
          preference_class, use_type, pp_type, tg_min, tg_max,
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
          is_hf, data_source, filename
        ) VALUES (
          :name, :request_date, :handler, :status, :complete_date,
          :vendor, :family, :glass_style, :resin_percentage, :rav_thickness,
          :preference_class, :use_type, :pp_type, :tg_min, :tg_max,
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
          :is_hf, :data_source, :filename
        )`,
        bindParams,
        { autoCommit: true }
      );

      createdRecords.push(bindParams);
    }

    res.status(201).json({
      success: true,
      message: 'Import thành công',
      data: createdRecords
    });

  } catch (error) {
    console.error('Error importing material_pp:', error);
    res.status(500).json({
      success: false,
      message: 'Import thất bại',
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
