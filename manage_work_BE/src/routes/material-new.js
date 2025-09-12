const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
require('dotenv').config();

const { addHistoryNewRecord } = require('./material-new-history');
const { authenticateToken, checkMaterialCorePermission } = require('../middleware/auth');

const {
  generateCreateMaterialEmailHTML,
  generateStatusUpdateEmailHTML,
  generateMaterialChangeEmailHTML,
  sendMailMaterialNew
} = require('../helper/sendMailMaterialNew');


const AllEmails = [
  'trang.nguyenkieu@meiko-elec.com',
  'thuy.nguyen2@meiko-elec.com'
];

// Lấy danh sách material core
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
      const columnNames = ['VENDOR', 'FAMILY_CORE', 'FAMILY_PP', 'IS_HF'];
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
      FROM material_new 
      WHERE is_deleted = 0 ${searchWhere}
    `;

    // Xây dựng query chính với pagination
    const mainQuery = `
      SELECT * FROM (
        SELECT a.*, ROW_NUMBER() OVER (ORDER BY id DESC) as row_num FROM (
          SELECT
            id,
            requester_name,
            request_date,
            handler,
            complete_date,
            status,
            vendor,
            family_core,
            family_pp,
            is_hf,
            material_type,
            erp,
            erp_pp,
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
    // Validate required fields
    const requiredFields = ['VENDOR', 'FAMILY_CORE', 'FAMILY_PP', 'IS_HF', 'IS_CAF'];
    const missingFields = requiredFields.filter(field => data[field] === undefined || data[field] === '');
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }
    const createdRecords = [];
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
      erp_pp: data.ERP_PP || '',
      erp_vendor: data.ERP_VENDOR || '',
      is_caf: Number(data.IS_CAF) || 0,
      tg: data.TG || '',
      bord_type: data.BORD_TYPE || '',
      plastic: data.PLASTIC || '',
      file_name: data.FILE_NAME || '',
      data: data.DATA || '',
      is_deleted: 0,
    };

    // Execute insert with proper error handling
    try {
      await connection.execute(
        `INSERT INTO material_new (
          id, requester_name, request_date, status, vendor, family_core,
          family_pp, is_hf, material_type, erp, erp_pp, erp_vendor, is_caf,
          tg, bord_type, plastic, file_name, data,
          is_deleted
        ) VALUES (
          :id, :requester_name, :request_date, :status, :vendor, :family_core,
          :family_pp, :is_hf, :material_type, :erp, :erp_pp, :erp_vendor, :is_caf,
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
            erp_pp: data.ERP_PP,
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
      }

      const verifyResult = await connection.execute(
        `SELECT * FROM material_new WHERE id = :id`,
        { id: nextId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!verifyResult.rows || verifyResult.rows.length === 0) {
        throw new Error('Record not found after insert');
      }

      // ✅ SỬA: Thêm record vào createdRecords với đúng cấu trúc
      const insertedRecord = verifyResult.rows[0];
      createdRecords.push({
        id: insertedRecord.ID,
        VENDOR: insertedRecord.VENDOR,
        FAMILY_CORE: insertedRecord.FAMILY_CORE,
        FAMILY_PP: insertedRecord.FAMILY_PP,
        IS_HF: insertedRecord.IS_HF,
        MATERIAL_TYPE: insertedRecord.MATERIAL_TYPE,
        ERP: insertedRecord.ERP,
        ERP_PP: insertedRecord.ERP_PP,
        ERP_VENDOR: insertedRecord.ERP_VENDOR,
        IS_CAF: insertedRecord.IS_CAF,
        TG: insertedRecord.TG,
        BORD_TYPE: insertedRecord.BORD_TYPE,
        PLASTIC: insertedRecord.PLASTIC,
        FILE_NAME: insertedRecord.FILE_NAME,
        DATA: insertedRecord.DATA
      });

      console.log('Insert successful, verified record:', insertedRecord);

      res.status(201).json({
        success: true,
        message: 'Thêm mới thành công',
        data: insertedRecord
      });

      setImmediate(async () => {
        try {
          const emailSubject = `[Material System] 📝Tạo mới Material New - ${insertedRecord.VENDOR || 'N/A'} | ${insertedRecord.FAMILY_CORE || 'N/A'} | ${insertedRecord.FAMILY_PP || 'N/A'}`;

          // Chuẩn bị dữ liệu cho email template với đúng key names
          const emailData = {
            REQUESTER_NAME: insertedRecord.REQUESTER_NAME,
            REQUEST_DATE: insertedRecord.REQUEST_DATE,
            STATUS: insertedRecord.STATUS,
            VENDOR: insertedRecord.VENDOR,
            FAMILY_CORE: insertedRecord.FAMILY_CORE,
            FAMILY_PP: insertedRecord.FAMILY_PP
          };

          const emailHTML = generateCreateMaterialEmailHTML(emailData, createdRecords);
          let recipients = [...AllEmails];
          if (creatorEmail && !recipients.includes(creatorEmail)) {
            recipients.push(creatorEmail);
          }
          recipients = [...new Set(recipients)];
          await sendMailMaterialNew(emailSubject, emailHTML, recipients);
          console.log('Email notification sent successfully for new material creation');
        } catch (emailError) {
          console.error('Warning: Failed to send email notification:', emailError);
        }
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

    // Chuyển đổi tên trường từ UPPERCASE sang lowercase để khớp với mapping
    const normalizedUpdateData = {};
    Object.keys(updateData).forEach(key => {
      const lowerKey = key.toLowerCase();
      normalizedUpdateData[lowerKey] = updateData[key];
    });

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

    // Lấy dữ liệu của bản ghi cũ trước khi cập nhật
    let oldStatus = null;
    let oldRecordData = null;

    try {
      const oldResult = await connection.execute(
        `SELECT * FROM material_new WHERE id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (oldResult.rows.length > 0) {
        oldRecord = oldResult;
        oldRecordData = oldResult.rows[0];
        oldStatus = oldRecordData.STATUS;
      } else {
        return res.status(404).json({
          message: 'Không tìm thấy bản ghi',
          details: `Không tìm thấy bản ghi với ID: ${id}`
        });
      }
    } catch (error) {
      console.error('Error fetching old record:', error);
      return res.status(500).json({
        message: 'Lỗi khi lấy thông tin bản ghi cũ',
        error: error.message
      });
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
      erp_pp: 'erp_pp',
      erp_vendor: 'erp_vendor',
      is_caf: 'is_caf',
      tg: 'tg',
      bord_type: 'bord_type',
      plastic: 'plastic',
      file_name: 'file_name',
      data: 'data',
      is_deleted: 'is_deleted',
      handler: 'handler',
      complete_date: 'complete_date'
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
        } else {
          bindParams[key] = normalizedUpdateData[key] || null;
        }
      } else if (normalizedUpdateData[key] !== undefined && !columnMapping[key]) {
        console.warn(`Field ${key} not found in column mapping`);
      }
    });

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
    const result = await connection.execute(updateQuery, bindParams, { autoCommit: true });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }

    // Get updated record
    const updatedRecord = await connection.execute(
      `SELECT * FROM material_new WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (updateData.status && oldStatus && updateData.status !== oldStatus) {
      setImmediate(async () => {
        try {
          const materialInfo = updatedRecord.rows[0];
          const newStatus = updateData.status;

          // Chỉ gửi email khi chuyển từ Pending sang Approve hoặc Cancel
          if (oldStatus === 'Pending' && (newStatus === 'Approve' || newStatus === 'Cancel')) {
            const emailSubject = `[Material System] ✅ Material New được cập nhật - ID: ${id}`;
            const emailHTML = generateStatusUpdateEmailHTML(
              id,
              newStatus,
              req.user.username,
              {
                vendor: materialInfo.VENDOR,
                family_core: materialInfo.FAMILY_CORE,
                family_pp: materialInfo.FAMILY_PP,
                requester_name: materialInfo.REQUESTER_NAME
              }
            );
            let recipients = [...AllEmails];
            if (creatorEmail && !recipients.includes(creatorEmail)) {
              recipients.push(creatorEmail);
            }
            recipients = [...new Set(recipients)];
            // ✅ SỬA: Gọi đúng function sendMailMaterialNew thay vì sendMailMaterialPP
            await sendMailMaterialNew(emailSubject, emailHTML), recipients;
            console.log(`✅ Email notification sent for status change: ${oldStatus} -> ${newStatus}`);
          }
        } catch (emailError) {
          console.error('❌ Warning: Failed to send status update email:', emailError);
        }
      });
    }

    await addHistoryNewRecord(connection, {
      materialNewId: id,
      actionType: 'UPDATE',
      data: updateData,
      createdBy: req.user.username
    });
    if (oldStatus === 'Approve') {
      setImmediate(async () => {
        try {
          // So sánh các giá trị để tìm ra thay đổi
          const changes = [];
          const fieldLabels = {
            requester_name: 'Người yêu cầu',
            request_date: 'Ngày yêu cầu',
            handler: 'Người xử lý',
            vendor: 'Vendor',
            family_core: 'Family Core',
            family_pp: 'Family PP',
            is_hf: 'Is HF',
            material_type: 'Material Type',
            erp: 'ERP',
            erp_pp: 'ERP PP',
            erp_vendor: 'ERP Vendor',
            is_caf: 'IS CAF',
            tg: 'TG',
            bord_type: 'BORD Type',
            plastic: 'Plastic',
            file_name: 'File name',
            data: 'Data Source',
          };

          Object.keys(normalizedUpdateData).forEach(key => {
            if (key !== 'status' && columnMapping[key]) {
              const dbColumnName = columnMapping[key].toUpperCase();
              const oldValue = oldRecordData[dbColumnName];
              const newValue = normalizedUpdateData[key];
              const isChanged = () => {
                const normalizeValue = (val) => {
                  if (val === null || val === undefined || val === '') return null;
                  return String(val).trim();
                };

                const normalizedOld = normalizeValue(oldValue);
                const normalizedNew = normalizeValue(newValue);

                return normalizedOld !== normalizedNew;
              };

              if (isChanged()) {
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
            console.log(`✅ Sending email for ${changes.length} changes in approved material ID: ${id}`);

            const emailSubject = `[Material System] ⚠️ Thay đổi dữ liệu Material Core đã được Approve - ID: ${id}`;
            const emailHTML = generateMaterialChangeEmailHTML(
              id,
              changes,
              req.user?.username || 'System',
              {
                vendor: oldRecordData.VENDOR,
                family_core: oldRecordData.FAMILY_CORE,
                family_pp: oldRecordData.FAMILY_PP,
                material_type: oldRecordData.MATERIAL_TYPE,
              }
            );
              let recipients = [...AllEmails];
          if (creatorEmail && !recipients.includes(creatorEmail)) {
            recipients.push(creatorEmail);
          }
          recipients = [...new Set(recipients)];

            await sendMailMaterialNew(emailSubject, emailHTML, recipients);
            console.log(`✅ Email sent successfully for material changes in approved record (ID: ${id})`);
          } else {
            console.log(`ℹ️ No significant changes detected for approved material ID: ${id}`);
          }

        } catch (emailError) {
          console.error('❌ Failed to send material change email:', emailError);
          // ✅ THÊM CHI TIẾT ERROR
          console.error('Error details:', {
            materialId: id,
            oldStatus: oldStatus,
            updateData: normalizedUpdateData,
            errorMessage: emailError.message,
            errorStack: emailError.stack
          });
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

router.post('/import-material-new', checkMaterialCorePermission(['create']), async (req, res) => {
  let connection;

  try {
    const { data } = req.body;
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: 'Invalid data format' });
    }

    // Debug: Log first row to see structure
    console.log('First row structure:', JSON.stringify(data[0], null, 2));

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

    const mapExcelKeysToDbKeys = (excelRow) => {
      // Debug: Log all available keys and TG-related values
      console.log('Available Excel keys:', Object.keys(excelRow));
      console.log('TG raw value from Tg(TMA):', excelRow['Tg(TMA)']);
      console.log('TG raw value from TG:', excelRow['TG']);
      console.log('TG raw value from Tg:', excelRow['Tg']);

      // Try multiple possible column names for TG
      let tgValue = excelRow['Tg(TMA)'] ||
        excelRow['TG(TMA)'] ||
        excelRow['Tg (TMA)'] ||  // with space
        excelRow['TG (TMA)'] ||  // with space
        excelRow['Tg'] ||
        excelRow['TG'] ||
        excelRow['tg'];

      console.log('Final TG value selected:', tgValue);

      return {
        requester_name: safeValue(excelRow.REQUESTER_NAME),
        request_date: safeValue(excelRow.REQUEST_DATE, 'date'),
        status: safeValue(excelRow.STATUS) || 'Pending',
        vendor: safeValue(excelRow.Vendor),
        family_core: safeValue(excelRow['FAMILY_Core']),
        family_pp: safeValue(excelRow['FAMiLY_PP']),
        is_hf: safeValue(excelRow['IS_HF'], 'number'),
        material_type: safeValue(excelRow['Material_Type']),
        erp: safeValue(excelRow.ERP),
        erp_pp: safeValue(excelRow['ERP_PP']),
        erp_vendor: safeValue(excelRow['ERP_Vendor']),
        is_caf: safeValue(excelRow['IS_CAF'], 'number'),
        tg: safeValue(tgValue),
        bord_type: safeValue(excelRow['BoardType']),
        plastic: safeValue(excelRow['Mật độ nhựa']),
        file_name: safeValue(excelRow['DK-DF_FileName']),
        data: safeValue(excelRow['DATA_SOURCE_']),
      };
    };

    for (let i = 0; i < data.length; i++) {
      const item = mapExcelKeysToDbKeys(data[i]);

      // Check if record already exists
      const existingRecord = await connection.execute(
        `SELECT COUNT(*) as count FROM material_new 
         WHERE requester_name = :requester_name 
         AND request_date = :request_date 
         AND vendor = :vendor
         AND family_core = :family_core
         AND (is_deleted IS NULL OR is_deleted = 0)`,
        {
          requester_name: item.requester_name,
          request_date: item.request_date,
          vendor: item.vendor,
          family_core: item.family_core
        }
      );

      if (existingRecord.rows[0][0] > 0) {
        console.log(`Record already exists, skipping: ${JSON.stringify(item)}`);
        continue;
      }

      const bindParams = { ...item };

      await connection.execute(
        `INSERT INTO material_new (
          id, requester_name, request_date, status,
          vendor, family_core, family_pp, is_hf, material_type, 
          erp, erp_pp, erp_vendor, is_caf, tg, bord_type, 
          plastic, data, file_name, is_deleted
        ) VALUES (
          material_new_seq.NEXTVAL, :requester_name, :request_date, :status,
          :vendor, :family_core, :family_pp, :is_hf, :material_type, 
          :erp, :erp_pp, :erp_vendor, :is_caf, :tg, :bord_type, 
          :plastic, :data, :file_name, 0
        )`,
        bindParams,
        { autoCommit: false }
      );
      createdRecords.push(bindParams);
    }

    // Commit all changes at once
    await connection.commit();
    res.status(201).json({
      success: true,
      message: 'Import thành công',
      data: createdRecords
    });

  } catch (error) {
    console.error('Error importing material_new:', error);
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
