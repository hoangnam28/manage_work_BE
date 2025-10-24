const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const {
  generateCreateMaterialEmailHTML,
  generateStatusUpdateEmailHTML,
  generateMaterialChangeEmailHTML,
  generateMaterialDeleteEmailHTML,
  sendMailMaterialCore
} = require('../helper/sendMailMaterialCore');

const {
  authenticateToken,
  checkMaterialCorePermission
} = require('../middleware/auth');
const { addHistoryRecord } = require('./material-core-history');


const AllEmails = [
  'trang.nguyenkieu@meiko-elec.com',
  'thuy.nguyen2@meiko-elec.com',
  'thanh.vutien@meiko-elec.com',
  // 'hue.hoangthi@meiko-elec.com',
  // 'thoi.nguyen@meiko-elec.com',
  // 'thuy.nguyen1@meiko-elec.com',
  // 'hung.khuathuu@meiko-elec.com',
  // 'quyen.tavan@meiko-elec.com',
  // 'thuy.nguyen1@meiko-elec.com',
  // 'khoi.lecong@meiko-elec.com',
  // 'thuy.nguyen1@meiko-elec.com',
  // 'hung.nguyen@meiko-elec.com',
  // 'phong.nguyentuan@meiko-elec.com',
  // 'quang.nguyenvan3@meiko-elec.com',
  // 'haianh.nguyen@meiko-elec.com',
  // 'duy.vuquang@meiko-elec.com',
  // 'son.lebao@meiko-elec.com',
  // 'loc.doan@meiko-elec.com',
  // 'tuyetanh.tran@meiko-elec.com',
  // 'anh.dohong@meiko-elec.com',
  // 'khanh.leduyquoc@meiko-elec.com',
  // 'tu.kieuviet@meiko-elec.com',
  // 'an.lexuan@meiko-elec.com',
  // 'giang.nguyenhong@meiko-elec.com',
  // 'trung.phamngoc@meiko-elec.com',
  // 'tuan.phamminh@meiko-elec.com',
  'nam.nguyenhoang@meiko-elec.com',
  'trung.khuatvan@meiko-elec.com',
  'hung.nguyencong@meiko-elec.com',
  'van.trinh@meiko-elec.com'
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
      const stringColumns = ['FAMILY', 'CENTER_GLASS']; // cột text
      const numberColumns = ['NOMINAL_THICKNESS', 'SPEC_THICKNESS', 'TOP_FOIL_CU_WEIGHT', 'BOT_FOIL_CU_WEIGHT']; // cột số
      const searchValue = req.query[key];
      if (searchValue && searchValue.trim() !== '') {
        const fieldName = key.toUpperCase();
        const paramName = `SEARCH_${fieldName}`;

        if (stringColumns.includes(fieldName)) {
          searchConditions.push(`UPPER(${fieldName}) LIKE :${paramName}`);
          searchBindings[paramName] = `%${searchValue.toUpperCase()}%`;
        } else if (numberColumns.includes(fieldName)) {
          searchConditions.push(`${fieldName} = :${paramName}`);
          searchBindings[paramName] = parseFloat(searchValue);
        }
      }
    });

    connection = await database.getConnection();
    const searchWhere = searchConditions.length > 0
      ? `WHERE ${searchConditions.join(' AND ')}`
      : '';
    const countQuery = `
        SELECT COUNT(*) as total 
        FROM material_core
        ${searchWhere}
      `;

    let mainQuery = `
  SELECT * FROM (
      SELECT a.*, ROW_NUMBER() OVER (
        ORDER BY 
        id DESC  
    ) as rn FROM (
      SELECT 
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
        reason,
        data_source,
        filename,
        is_deleted  
      FROM material_core 
      ${searchWhere}  
    ) a
  ) 
  WHERE rn > :offset AND rn <= :limit`;

    const bindParams = {
      offset: offset,
      limit: offset + validPageSize,
      ...searchBindings
    };
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countQuery, searchBindings, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute(mainQuery, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT })
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

// Route để lấy tất cả dữ liệu (cho export)
router.get('/all', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(`SELECT 
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
        reason,
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
    console.error('Error in /all route:', err);
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
    const data = req.body;
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

    const createdRecords = [];
    for (let i = 0; i < topArr.length; i++) {
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
        is_hf: data.is_hf !== undefined && data.is_hf !== null ? data.is_hf : 'FALSE',
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

      // Lưu lịch sử
      try {
        await addHistoryRecord(connection, {
          materialCoreId: nextId,
          actionType: 'CREATE',
          createdBy: req.user.username,
          data: {
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
    }
    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Material core(s) created successfully',
      data: createdRecords
    });

    setImmediate(async () => {
      try {
        const emailSubject = `[Material System] Tạo mới Material Core - ${data.vendor || 'N/A'} | ${data.family || 'N/A'}`;
        const emailHTML = generateCreateMaterialEmailHTML(data, createdRecords);
        let recipients = [...AllEmails];
        if (creatorEmail && !recipients.includes(creatorEmail)) {
          recipients.push(creatorEmail);
        }
        recipients = [...new Set(recipients)];

        await sendMailMaterialCore(emailSubject, emailHTML, recipients);
        console.log('Email notification sent successfully for new material creation');
      } catch (emailError) {
        console.error('Warning: Failed to send email notification:', emailError);
        // Email fail không ảnh hưởng gì vì đã trả response thành công
      }
    });

  } catch (error) {
    console.error('Error creating material core:', error);
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
    }
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

  const isStatusOnlyUpdate = () => {
  const keys = Object.keys(updateData);
  const allowedKeys = ['status', 'complete_date', 'id', 'reason', 'handler'];
  const hasStatus = 'status' in updateData;
  const hasOtherFields = keys.some(key => !allowedKeys.includes(key));
  
  return hasStatus && !hasOtherFields;
};
  if (isStatusOnlyUpdate()) {
    // Chỉ cập nhật trạng thái
    const hasApprovePermission = checkMaterialCorePermission(['approve']);
    try {
      hasApprovePermission(req, res, () => { });
    } catch (error) {
      return res.status(403).json({
        message: 'Chỉ Admin mới có quyền Approve/Cancel',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }
  } else {
    // Cập nhật field khác => yêu cầu quyền edit và phải có lý do
    const hasEditPermission = checkMaterialCorePermission(['edit']);
    try {
      hasEditPermission(req, res, () => { });
    } catch (error) {
      return res.status(403).json({
        message: 'Bạn không có quyền chỉnh sửa',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    if (!updateData.reason || updateData.reason.trim() === '') {
      return res.status(400).json({
        message: 'Vui lòng nhập lý do cập nhật',
        code: 'REASON_REQUIRED'
      });
    }

    if (updateData.reason.trim().length < 5) {
      return res.status(400).json({
        message: 'Lý do cập nhật phải có ít nhất 5 ký tự',
        code: 'REASON_TOO_SHORT'
      });
    }
  }


  try {
    // Verify that id exists
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

    // ALWAYS fetch old record data before updating
    const oldRecord = await connection.execute(
      `SELECT * FROM material_core WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (oldRecord.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }

    const oldStatus = oldRecord.rows[0].STATUS;
    const oldRecordData = oldRecord.rows[0];
    if (updateData.is_hf !== undefined) {
      if (updateData.is_hf === '' || updateData.is_hf === null) {
        updateData.is_hf = 'FALSE';
      }
    }

    if (updateData.status) {
      if (!['Approve', 'Cancel', 'Pending'].includes(updateData.status)) {
        return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
      }
    }
    if (updateData.top_foil_cu_weight) {
      if (Array.isArray(updateData.top_foil_cu_weight)) {
        updateData.top_foil_cu_weight = updateData.top_foil_cu_weight[0];
      }

      if (!['L', 'H', '1', '2', 'Z'].includes(updateData.top_foil_cu_weight)) {
        return res.status(400).json({ message: 'Giá trị top_foil_cu_weight không hợp lệ' });
      }
    }

    if (updateData.bot_foil_cu_weight) {
      if (Array.isArray(updateData.bot_foil_cu_weight)) {
        updateData.bot_foil_cu_weight = updateData.bot_foil_cu_weight[0];
      }

      if (!['L', 'H', '1', '2', 'Z'].includes(updateData.bot_foil_cu_weight)) {
        return res.status(400).json({ message: 'Giá trị bot_foil_cu_weight không hợp lệ' });
      }
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
      reason: 'reason',
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
      'dk_30ghz', 'df_30ghz',
      'dk_35ghz', 'df_35ghz',
      'dk_40ghz', 'df_40ghz',
      'dk_45ghz', 'df_45ghz',
      'dk_50ghz', 'df_50ghz',
      'dk_55ghz'
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
      if (key === 'is_hf' || key === 'rigid') {
        bindParams[key] = updateData[key] === 'TRUE' || updateData[key] === true ? 'TRUE' : 'FALSE';
      } else {
        bindParams[key] = updateData[key] || null;
      }
    }
  }
});

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu cập nhật' });
    }

    const updateQuery = `
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

    // IMPROVED EMAIL LOGIC - Send email for ANY status change
    if (updateData.status && oldStatus !== updateData.status) {
      // Use setImmediate to send email asynchronously after response
      setImmediate(async () => {
        try {
          const materialInfo = updatedRecord.rows[0];
          const newStatus = updateData.status;

          console.log(`Status changed from ${oldStatus} to ${newStatus} for ID: ${id}`);

          const emailSubject = `[Material System] ✅ Đã cập nhật trạng thái Material Core ${materialInfo.VENDOR} `;
          const emailHTML = generateStatusUpdateEmailHTML(
            id,
            oldStatus,
            newStatus,
            req.user?.username || 'System',
            {
              vendor: materialInfo.VENDOR,
              family: materialInfo.FAMILY,
              requester_name: materialInfo.REQUESTER_NAME,
              nominal_thickness: materialInfo.NOMINAL_THICKNESS,
              top_foil_cu_weight: materialInfo.TOP_FOIL_CU_WEIGHT,
              bot_foil_cu_weight: materialInfo.BOT_FOIL_CU_WEIGHT
            }
          );
          let recipients = [...AllEmails];
          if (creatorEmail && !recipients.includes(creatorEmail)) {
            recipients.push(creatorEmail);
          }
          recipients = [...new Set(recipients)];

          await sendMailMaterialCore(emailSubject, emailHTML, recipients);
          console.log(`✅ Email sent successfully for status change: ${oldStatus} → ${newStatus} (ID: ${id})`);

        } catch (emailError) {
          console.error('❌ Failed to send status update email:', emailError);
        }
      });
    }

    // Save history - include reason in the history data
    try {
      const historyData = { ...updateData };
      if (updateData.reason) {
        historyData.reason = updateData.reason; // Store reason separately in history
      }

      await addHistoryRecord(connection, {
        materialCoreId: id,
        actionType: 'UPDATE',
        data: historyData,
        createdBy: req.user?.username || 'System'
      });
    } catch (historyError) {
      console.error('Warning: Failed to record history:', historyError);
    }

    // Send email for changes to approved materials (excluding status-only updates)
    if (oldStatus === 'Approve' && !isStatusOnlyUpdate()) {
      setImmediate(async () => {
        try {
          // Compare values to find changes
          const changes = [];
          const fieldLabels = {
            requester_name: 'Người yêu cầu',
            request_date: 'Ngày yêu cầu',
            handler: 'Người xử lý',
            vendor: 'Vendor',
            family: 'Family',
            prepreg_count: 'Prepreg Count',
            nominal_thickness: 'Nominal Thickness',
            spec_thickness: 'Spec Thickness',
            use_type: 'Use Type',
            rigid: 'Rigid',
            top_foil_cu_weight: 'Top Foil Cu Weight',
            bot_foil_cu_weight: 'Bot Foil Cu Weight',
            tg_min: 'TG Min',
            tg_max: 'TG Max',
            center_glass: 'Center Glass',
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
            dk_30ghz: 'DK 30GHz',
            df_30ghz: 'DF 30GHz',
            dk_35ghz: 'DK 35GHz',
            df_35ghz: 'DF 35GHz',
            dk_40ghz: 'DK 40GHz',
            df_40ghz: 'DF 40GHz',
            dk_45ghz: 'DK 45GHz',
            df_45ghz: 'DF 45GHz',
            dk_50ghz: 'DK 50GHz',
            df_50ghz: 'DF 50GHz',
            dk_55ghz: 'DK 55GHz',
            df_55ghz: 'DF 55GHz',
            is_hf: 'IS_HF',
            reason: 'Lý do',
            data_source: 'Data Source',
            filename: 'Filename'
          };

          Object.keys(updateData).forEach(key => {
            if (key !== 'status' && key !== 'reason' && columnMapping[key]) {
              const dbColumnName = columnMapping[key].toUpperCase();
              const oldValue = oldRecordData[dbColumnName];
              const newValue = updateData[key];

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

            const emailSubject = `[Material System] ⚠️ Thay đổi dữ liệu Material Core đã được Approve - ID: ${id}`;
            const emailHTML = generateMaterialChangeEmailHTML(
              id,
              changes,
              req.user?.username || 'System',
              {
                vendor: oldRecordData.VENDOR,
                family: oldRecordData.FAMILY,
                requester_name: oldRecordData.REQUESTER_NAME,
                nominal_thickness: oldRecordData.NOMINAL_THICKNESS,
                top_foil_cu_weight: oldRecordData.TOP_FOIL_CU_WEIGHT,
                bot_foil_cu_weight: oldRecordData.BOT_FOIL_CU_WEIGHT,
                reason: updateData.reason
              }
            );
            let recipients = [...AllEmails];
            if (creatorEmail && !recipients.includes(creatorEmail)) {
              recipients.push(creatorEmail);
            }
            recipients = [...new Set(recipients)];

            await sendMailMaterialCore(emailSubject, emailHTML, recipients);
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

router.delete('/delete/:id', authenticateToken, checkMaterialCorePermission(['delete']), async (req, res) => {
  let { id } = req.params;
  let connection;
  const { reason } = req.body;

  try {
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        message: 'ID không hợp lệ'
      });
    }
    id = Number(id);

    if (!reason) {
      return res.status(400).json({
        message: 'Vui lòng nhập lý do xóa',
        code: 'REASON'
      });
    }

    connection = await database.getConnection();

    // Lấy thông tin email của người thực hiện
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

    // Lấy thông tin material core trước khi xóa để gửi email
    const materialRecord = await connection.execute(
      `SELECT * FROM material_core WHERE id = :id AND is_deleted = 0`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (materialRecord.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }

    const materialData = materialRecord.rows[0];

    const result = await connection.execute(
      `UPDATE material_core 
      SET is_deleted = 1, 
          reason = :reason,
          deleted_by = :deletedBy,
          deleted_at = SYSDATE
      WHERE id = :id`,
      {
        id,
        reason,
        deletedBy: req.user.username
      },
      { autoCommit: true }
    );

    if (result.rowsAffected > 0) {
      // Lưu lịch sử với lý do xóa
      try {
        await addHistoryRecord(connection, {
          materialCoreId: id,
          actionType: 'DELETE',
          changeDetails: {
            description: 'Xóa Material Core',
            reason: reason // Lưu lý do vào history
          },
          createdBy: req.user.username
        });
      } catch (historyError) {
        console.error('Warning: Failed to record history:', historyError);
      }
    }

    res.json({
      message: 'Xóa mềm thành công',
      id: id
    });

    // Gửi email thông báo xóa (async) - bao gồm lý do
    setImmediate(async () => {
      try {
        const emailSubject = `[Material System] 🗑️ Yêu cầu xóa Material Core - ${materialData.VENDOR || 'N/A'} | ${materialData.FAMILY || 'N/A'}`;
        const emailHTML = generateMaterialDeleteEmailHTML(
          id,
          req.user?.username || 'System',
          {
            vendor: materialData.VENDOR,
            family: materialData.FAMILY,
            requester_name: materialData.REQUESTER_NAME,
            request_date: materialData.REQUEST_DATE,
            handler: materialData.HANDLER,
            status: materialData.STATUS,
            nominal_thickness: materialData.NOMINAL_THICKNESS,
            spec_thickness: materialData.SPEC_THICKNESS,
            top_foil_cu_weight: materialData.TOP_FOIL_CU_WEIGHT,
            bot_foil_cu_weight: materialData.BOT_FOIL_CU_WEIGHT,
            tg_min: materialData.TG_MIN,
            tg_max: materialData.TG_MAX,
            center_glass: materialData.CENTER_GLASS,
            use_type: materialData.USE_TYPE,
            rigid: materialData.RIGID,
            is_hf: materialData.IS_HF,
            data_source: materialData.DATA_SOURCE,
            filename: materialData.FILENAME,
            delete_reason: reason // Thêm lý do xóa vào email
          }
        );

        let recipients = [...AllEmails];
        if (creatorEmail && !recipients.includes(creatorEmail)) {
          recipients.push(creatorEmail);
        }
        recipients = [...new Set(recipients)];

        await sendMailMaterialCore(emailSubject, emailHTML, recipients);
        console.log(`✅ Email sent successfully for material deletion (ID: ${id})`);

      } catch (emailError) {
        console.error('❌ Failed to send material deletion email:', emailError);
      }
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

    const tempName = `MaterialCoreExport_${Date.now()}.xlsm`;
    const tempPath = path.join(__dirname, `../public/template/${tempName}`);
    cloneFileSync(templatePath, tempPath);

    const workbook = XLSX.readFile(tempPath, { type: 'binary', bookVBA: true });

    const sheetName = workbook.SheetNames[6];
    if (!sheetName) {
      fs.unlinkSync(tempPath);
      return res.status(500).json({ message: 'Sheet 7 not found in template' });
    }

    const ws = workbook.Sheets[sheetName];

    const map = [
      'VENDOR', 'FAMILY', 'PREPREG_COUNT', 'NOMINAL_THICKNESS', 'SPEC_THICKNESS',
      'PREFERENCE_CLASS', 'USE_TYPE', 'RIGID', 'TOP_FOIL_CU_WEIGHT', 'BOT_FOIL_CU_WEIGHT',
      'TG_MIN', 'TG_MAX', 'CENTER_GLASS',
      null, 'DK_01G', 'DF_01G', 'DK_0_001GHZ', 'DF_0_001GHZ', 'DK_0_01GHZ', 'DF_0_01GHZ',
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

function normalizeKeys(obj) {
  const newObj = {};
  Object.keys(obj).forEach(key => {
    newObj[key.toLowerCase()] = obj[key];
  });
  return newObj;
}

function mapExcelKeysToDbKeys(item) {
  const newItem = { ...item };

  const columnMapping = {
    'NOMINAL_THICKNESS_': 'NOMINAL_THICKNESS',
    'SPEC_THK_': 'SPEC_THICKNESS',
    'SPEC_THK': 'SPEC_THICKNESS',
    'DATA_SOURCE_': 'DATA_SOURCE',
    'H_USE_TYPE_': 'USE_TYPE',
    'PREFERENCE_CLASS_': 'PREFERENCE_CLASS',  // Đã có
    'CENTER_GLASS_': 'CENTER_GLASS',          // Đã có
    'DK_01G_': 'DK_01G',
    'DF_01G_': 'DF_01G',
    'DK_2_45GHz_': 'DK_2_45GHZ',
    'DF_2_45GHz_': 'DF_2_45GHZ',
    'DK_0_001GHz_': 'DK_0_001GHZ',
    'DF_0_001GHz_': 'DF_0_001GHZ',
    'DK_0_01GHz_': 'DK_0_01GHZ',
    'DF_0_01GHz_': 'DF_0_01GHZ',
    'DK_0_02GHz_': 'DK_0_02GHZ',
    'DF_0_02GHz_': 'DF_0_02GHZ',
    'DK_2GHz_': 'DK_2GHZ',
    'DF_2GHz_': 'DF_2GHZ',
    'DK_3GHz_': 'DK_3GHZ',
    'DF_3GHz_': 'DF_3GHZ',
    'DK_4GHz_': 'DK_4GHZ',
    'DF_4GHz_': 'DF_4GHZ',
    'DK_5GHz_': 'DK_5GHZ',
    'DF_5GHz_': 'DF_5GHZ',
    'DK_8GHz_': 'DK_8GHZ',
    'DF_8GHz_': 'DF_8GHZ',
    'DK_10GHz_': 'DK_10GHZ',
    'DF_10GHz_': 'DF_10GHZ',
    'DK_15GHz_': 'DK_15GHZ',
    'DF_15GHz_': 'DF_15GHZ',
    'DK_16GHz_': 'DK_16GHZ',
    'DF_16GHz_': 'DF_16GHZ',
    'DK_20GHz_': 'DK_20GHZ',
    'DF_20GHz_': 'DF_20GHZ'
  };

  // Áp dụng mapping
  Object.keys(columnMapping).forEach(excelKey => {
    if (newItem[excelKey] !== undefined) {
      newItem[columnMapping[excelKey]] = newItem[excelKey];
      delete newItem[excelKey];
    }
  });

  // Bỏ qua các cột không cần thiết
  const ignoreColumns = ['Date', 'Lí do cập nhật', 'Người xử lý', 'Trạng thái', 'Ngày hoàn thành'];
  ignoreColumns.forEach(col => {
    delete newItem[col];
  });

  // Chuẩn hóa về lowercase
  const normalized = normalizeKeys(newItem);

  // XỬ LÝ PARSE SỐ CHO PREFERENCE_CLASS VÀ CENTER_GLASS
  // PREFERENCE_CLASS là NUMBER
  if (normalized.preference_class !== undefined && normalized.preference_class !== null && normalized.preference_class !== '') {
    const parsed = parseFloat(normalized.preference_class);
    normalized.preference_class = isNaN(parsed) ? null : parsed;
  }

  // CENTER_GLASS là VARCHAR2 nhưng cần convert từ số sang string
  if (normalized.center_glass !== undefined && normalized.center_glass !== null && normalized.center_glass !== '') {
    normalized.center_glass = String(normalized.center_glass).trim();
  }

  return normalized;
}
function getValidCuWeightList(value) {
  if (!value) return ['Z'];
  return value
    .toString()
    .split(/[\n,]+/)
    .map(v => v.trim())
    .filter(v => ['L', 'H', '1', '2', 'Z'].includes(v));
}
router.post('/import-material-core', authenticateToken, checkMaterialCorePermission(['create']), async (req, res) => {
  let connection;
  try {
    const { data } = req.body;
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: 'Invalid data format' });
    }
    connection = await database.getConnection();
    const createdRecords = [];
    for (let i = 0; i < data.length; i++) {
      // Normalize key và mapping DK/DF key nếu thiếu dấu _ cuối
      const item = mapExcelKeysToDbKeys(data[i]);
      const topArr = getValidCuWeightList(item.top_foil_cu_weight);
      const botArr = getValidCuWeightList(item.bot_foil_cu_weight);
      const maxLen = Math.max(topArr.length, botArr.length);
      for (let j = 0; j < maxLen; j++) {
        const result = await connection.execute(
          `SELECT material_core_seq.NEXTVAL FROM DUAL`
        );
        const nextId = result.rows[0][0];
        const bindParams = {
          id: nextId,
          requester_name: item.requester_name,
          request_date: item.request_date,
          handler: item.handler,
          status: item.status || 'Pending',
          complete_date: item.complete_date,
          vendor: item.vendor,
          family: item.family,
          prepreg_count: item.prepreg_count,
          nominal_thickness: item.nominal_thickness,
          spec_thickness: item.spec_thickness,
          preference_class: item.preference_class,
          use_type: item.use_type,
          rigid: item.rigid,
          top_foil_cu_weight: topArr[j] || 'Z',
          bot_foil_cu_weight: botArr[j] || 'Z',
          tg_min: item.tg_min,
          tg_max: item.tg_max,
          center_glass: item.center_glass,
          dk_01g: item.dk_01g,
          df_01g: item.df_01g,
          dk_0_001ghz: item.dk_0_001ghz,
          df_0_001ghz: item.df_0_001ghz,
          dk_0_01ghz: item.dk_0_01ghz,
          df_0_01ghz: item.df_0_01ghz,
          dk_0_02ghz: item.dk_0_02ghz,
          df_0_02ghz: item.df_0_02ghz,
          dk_2ghz: item.dk_2ghz,
          df_2ghz: item.df_2ghz,
          dk_2_45ghz: item.dk_2_45ghz,
          df_2_45ghz: item.df_2_45ghz,
          dk_3ghz: item.dk_3ghz,
          df_3ghz: item.df_3ghz,
          dk_4ghz: item.dk_4ghz,
          df_4ghz: item.df_4ghz,
          dk_5ghz: item.dk_5ghz,
          df_5ghz: item.df_5ghz,
          dk_6ghz: item.dk_6ghz,
          df_6ghz: item.df_6ghz,
          dk_7ghz: item.dk_7ghz,
          df_7ghz: item.df_7ghz,
          dk_8ghz: item.dk_8ghz,
          df_8ghz: item.df_8ghz,
          dk_9ghz: item.dk_9ghz,
          df_9ghz: item.df_9ghz,
          dk_10ghz: item.dk_10ghz,
          df_10ghz: item.df_10ghz,
          dk_15ghz: item.dk_15ghz,
          df_15ghz: item.df_15ghz,
          dk_16ghz: item.dk_16ghz,
          df_16ghz: item.df_16ghz,
          dk_20ghz: item.dk_20ghz,
          df_20ghz: item.df_20ghz,
          is_hf: item.is_hf !== undefined && item.is_hf !== null && item.is_hf !== '' ? item.is_hf : 'FALSE',
          data_source: item.data_source,
          filename: item.filename
        };
        await connection.execute(
          `INSERT INTO material_core (
            id, requester_name, request_date, handler, status, complete_date,
            vendor, family, prepreg_count, nominal_thickness, spec_thickness,
            preference_class, use_type, rigid, top_foil_cu_weight, bot_foil_cu_weight,
            tg_min, tg_max, center_glass,
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
            is_hf, data_source, filename
          ) VALUES (
            :id, :requester_name, :request_date, :handler, :status, :complete_date,
            :vendor, :family, :prepreg_count, :nominal_thickness, :spec_thickness,
            :preference_class, :use_type, :rigid, :top_foil_cu_weight, :bot_foil_cu_weight,
            :tg_min, :tg_max, :center_glass,
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
            :is_hf, :data_source, :filename
          )`,
          bindParams,
          { autoCommit: true }
        );
        createdRecords.push({ id: nextId, ...bindParams });
      }
    }
    res.status(201).json({
      success: true,
      message: 'Import thành công',
      data: createdRecords
    });
  } catch (error) {
    console.error('Error importing material core:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import material core',
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
function convertCuWeight(value) {
  const mapping = {
    'L': '0.33 oz',
    'H': '1 oz',
    '1': '1 oz',
    '2': '2 oz',
    'Z': '0 oz'
  };
  return mapping[value] || '0 oz';
}

// Helper function để format thickness
function formatThickness(value) {
  if (!value) return '0 mm';
  return `${value} mm`;
}

// Helper function để format temperature 
function formatTemperature(value) {
  if (!value) return '0 C';
  return `${value} C`;
}

// Helper function để format boolean
function formatBoolean(value) {
  if (value === 'TRUE' || value === true) return 'true';
  return 'false';
}

// Helper function để tạo NAME và GENERIC_NAME
function createCoreName(vendor, family, nominalThickness, topCu, botCu) {
  const thickness = nominalThickness || '0.000';
  const topCuDisplay = topCu === 'L' ? 'L' : (topCu === 'H' ? 'H' : topCu);
  const botCuDisplay = botCu === 'L' ? 'L' : (botCu === 'H' ? 'H' : botCu);

  const name = `Core ${vendor || 'Unknown'} ${family || 'Unknown'} ${thickness}mm ${topCuDisplay}/${botCuDisplay}`;
  const genericName = `${thickness}mm ${topCuDisplay}/${botCuDisplay}`;

  return { name, genericName };
}

// Route export XML
router.get('/export-xml', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();

    // Query chỉ lấy những bản ghi có status = 'Pending'
    const result = await connection.execute(
      `SELECT 
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
       WHERE is_deleted = 0 AND status = 'Pending'
       ORDER BY id DESC`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Không tìm thấy bản ghi nào có trạng thái Pending để xuất'
      });
    }

    // Tạo XML content
    let xmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<document xmlns:site='http://www.frontline-pcb.com/'
	schema='none'
	user='DataCollection Template'
	ver='7.7'
>
<interfacelist INTERFACE="CORE">`;

    // Tạo XML cho từng bản ghi
    result.rows.forEach(row => {
      const { name, genericName } = createCoreName(
        row.VENDOR,
        row.FAMILY,
        row.NOMINAL_THICKNESS,
        row.TOP_FOIL_CU_WEIGHT,
        row.BOT_FOIL_CU_WEIGHT
      );

      xmlContent += `
	<CORE
		NAME="${name}"
		GENERIC_NAME="${genericName}"
		VENDOR="${row.VENDOR || ''}"
		FAMILY="${row.FAMILY || ''}"
		PREPREG_COUNT="${row.PREPREG_COUNT || '1'}"
		NOMINAL_THICKNESS_="${formatThickness(row.NOMINAL_THICKNESS)}"
		SPEC_THK_="${formatThickness(row.SPEC_THICKNESS)}"
		PREFERENCE_CLASS_="${row.PREFERENCE_CLASS || '1'}"
		H_USE_TYPE_="${row.USE_TYPE || ''}"
		RIGID_="${formatBoolean(row.RIGID)}"
		TOP_FOIL_CU_WEIGHT="${convertCuWeight(row.TOP_FOIL_CU_WEIGHT)}"
		BOT_FOIL_CU_WEIGHT="${convertCuWeight(row.BOT_FOIL_CU_WEIGHT)}"
		TG_MIN="${formatTemperature(row.TG_MIN)}"
		TG_MAX="${formatTemperature(row.TG_MAX)}"
		CENTER_GLASS_="${row.CENTER_GLASS || ''}"
		MATERIAL_CLASS_="C"
		DK_01G_="${row.DK_01G || '0'}"
		DF_01G_="${row.DF_01G || '0'}"
		DK_0_001GHZ_="${row.DK_0_001GHZ || '0'}"
		DF_0_001GHZ_="${row.DF_0_001GHZ || '0'}"
		DK_0_01GHZ_="${row.DK_0_01GHZ || '0'}"
		DF_0_01GHZ_="${row.DF_0_01GHZ || '0'}"
		DK_0_02GHZ_="${row.DK_0_02GHZ || '0'}"
		DF_0_02GHZ_="${row.DF_0_02GHZ || '0'}"
		DK_2GHZ_="${row.DK_2GHZ || '0'}"
		DF_2GHZ_="${row.DF_2GHZ || '0'}"
		DK_3GHZ_="${row.DK_3GHZ || '0'}"
		DF_3GHZ_="${row.DF_3GHZ || '0'}"
		DK_4GHZ_="${row.DK_4GHZ || '0'}"
		DF_4GHZ_="${row.DF_4GHZ || '0'}"
		DK_5GHZ_="${row.DK_5GHZ || '0'}"
		DF_5GHZ_="${row.DF_5GHZ || '0'}"
		DK_6GHZ_="${row.DK_6GHZ || '0'}"
		DF_6GHZ_="${row.DF_6GHZ || '0'}"
		DK_7GHZ_="${row.DK_7GHZ || '0'}"
		DF_7GHZ_="${row.DF_7GHZ || '0'}"
		DK_8GHZ_="${row.DK_8GHZ || '0'}"
		DF_8GHZ_="${row.DF_8GHZ || '0'}"
		DK_9GHZ_="${row.DK_9GHZ || '0'}"
		DF_9GHZ_="${row.DF_9GHZ || '0'}"
		DK_10GHZ_="${row.DK_10GHZ || '0'}"
		DF_10GHZ_="${row.DF_10GHZ || '0'}"
		DK_12GHZ_="0"
		DK_15GHZ_="${row.DK_15GHZ || '0'}"
		DK_18GHZ_="0"
		DK_20GHZ_="${row.DK_20GHZ || '0'}"
		DK_25GHZ_="${row.DK_25GHZ || '0'}"
		DK_30GHZ_="${row.DK_30GHZ || '0'}"
		DK_35GHZ_="${row.DK_35GHZ || '0'}"
		DK_40GHZ_="${row.DK_40GHZ || '0'}"
		DK_45GHZ_="${row.DK_45GHZ || '0'}"
		DK_50GHZ_="${row.DK_50GHZ || '0'}"
		DF_12GHZ_="0"
		DF_15GHZ_="${row.DF_15GHZ || '0'}"
		DF_18GHZ_="0"
		DF_20GHZ_="${row.DF_20GHZ || '0'}"
		DF_25GHZ_="${row.DF_25GHZ || '0'}"
		DF_30GHZ_="${row.DF_30GHZ || '0'}"
		DF_35GHZ_="${row.DF_35GHZ || '0'}"
		DF_40GHZ_="${row.DF_40GHZ || '0'}"
		DF_45GHZ_="${row.DF_45GHZ || '0'}"
		DF_50GHZ_="${row.DF_50GHZ || '0'}"
		IS_HF_="${formatBoolean(row.IS_HF)}"
    IS_ROHS_=""
		LOW_DK_=""
		LOW_DF_=""
		IPC_21_=""
		IPC_24_=""
		IPC_26_=""
		IPC_97_=""
		IPC_98_=""
		IPC_99_=""
		IPC_101_=""
		IPC_124_=""
		IPC_126_=""
		COUNTRY_=""
		COUNTRY_CODE_=""
		DATA_SOURCE_="${row.DATA_SOURCE || row.FILENAME || ''}"
    CU_TYPE_=""
		CU_PROFILE_=""
		TOP_FOIL_OUTER_ROUGHNESS="0 micron"
		TOP_FOIL_INNER_ROUGHNESS="0 micron"
		BOT_FOIL_OUTER_ROUGHNESS="0 micron"
		BOT_FOIL_INNER_ROUGHNESS="0 micron"
		OBSOLETE="false"
		SUB_TYPE_=""
		CU_TYPE_IPC_=""
		CONTAINS_7628_=""
		TG_TYPE_=""
    LAMINATE_THICKNESS="1.464 mm"
		DIELECTRIC_THICKNESS_="1.464 mm"
		LAMINATE_THICKNESS_TOL_PLUS="75 micron"
		LAMINATE_THICKNESS_TOL_MINUS="75 micron"
		LAMINATE_PERMITTIVITY="4.8"
		LAMINATE_DISSIPATION_FACTOR="0.011"
		SHEET_SIZE_X="0 inch"
		SHEET_SIZE_Y="0 inch"
		GRAIN_DIRECTION="Vertical"
		TOP_FOIL_THICKNESS="18 micron"
		TOP_FOIL_THICKNESS_TOL_MINUS="0.9 micron"
		TOP_FOIL_THICKNESS_TOL_PLUS="0.9 micron"
		BOT_FOIL_THICKNESS="18 micron"
		BOT_FOIL_THICKNESS_TOL_MINUS="0.9 micron"
		BOT_FOIL_THICKNESS_TOL_PLUS="0.9 micron"
		MRP_NAME=""
		MRP_REVISION=""
		MRP_REV_DESCRIPTION=""
		TYPE="Core"
		UNIT_TYPE="Quantity"
		GLASS_TYPE="Glass Epoxy"
	/>`;
    });

    xmlContent += `
</interfacelist>
<interfacelist INTERFACE="SITE_MATERIAL">
	<SITE_MATERIAL 
		MATERIAL_NAME="${name}"
		COST="0"
		GRADE_PREFERENCE="60"
		PARENT_SITE_NAME="VN"
	/>
</interfacelist>
</document>`;

    // Set headers để download file
    const filename = `MaterialCore_Pending_Export.xml`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');

    res.send(xmlContent);

  } catch (err) {
    console.error('Error exporting XML:', err);
    res.status(500).json({
      message: 'Lỗi khi xuất file XML',
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
