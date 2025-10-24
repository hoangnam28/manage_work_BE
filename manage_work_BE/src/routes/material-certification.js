const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XlsxPopulate = require('xlsx-populate');
const sharp = require('sharp');
const multer = require('multer');

const crypto = require('crypto');

const {
  authenticateToken,
} = require('../middleware/auth');

// Helper function to get database connection
async function getConnection() {
  try {
    return await database.getConnection();
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});
async function getConnection() {
  try {
    return await database.getConnection();
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

// Get options for dropdowns
router.get('/options', async (req, res) => {
  let connection;

  try {
    connection = await getConnection();

    // Lấy Material Property 1
    const materialPropertyResult = await connection.execute(
      `SELECT PROPERTY1_ID, PROPERTY1_NAME_JP, PROPERTY1_NAME_VI 
       FROM MATERIAL_PROPERTY1 
       ORDER BY PROPERTY1_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Lấy Material Properties 2
    const property2Result = await connection.execute(
      `SELECT PROPERTY2_ID, PROPERTY2_NAME_JP, PROPERTY2_NAME_VI 
       FROM MATERIAL_PROPERTY2 
       ORDER BY PROPERTY2_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Lấy Material Properties 3
    const property3Result = await connection.execute(
      `SELECT PROPERTY3_ID, PROPERTY3_NAME_JP, PROPERTY3_NAME_VI 
       FROM MATERIAL_PROPERTY3 
       ORDER BY PROPERTY3_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Lấy Material Status
    const materialStatusResult = await connection.execute(
      `SELECT MATERIAL_STATUS_ID, MATERIAL_STATUS_NAME_JP, MATERIAL_STATUS_NAME_VI 
       FROM MATERIAL_STATUS 
       ORDER BY MATERIAL_STATUS_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Lấy UL Status
    const ulStatusResult = await connection.execute(
      `SELECT UL_STATUS_ID, UL_STATUS_NAME_JP, UL_STATUS_NAME_VI 
       FROM UL_STATUS 
       ORDER BY UL_STATUS_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Lấy Material Class
    const materialClassResult = await connection.execute(
      `SELECT CLASS_ID, CLASS_NAME_JP, CLASS_NAME_VI 
       FROM MATERIAL_CLASS 
       ORDER BY CLASS_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Lấy Reliability Level
    const reliabilityLevelResult = await connection.execute(
      `SELECT LEVEL_ID, LEVEL_NAME_JP, LEVEL_NAME_VI 
       FROM RELIABILITY_LEVEL 
       ORDER BY LEVEL_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Lấy Progress Status
    const progressStatusResult = await connection.execute(
      `SELECT STATUS_ID, STATUS_NAME FROM PROGRESS_STATUS ORDER BY STATUS_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Lấy Department In Charge
    const departmentResult = await connection.execute(
      `SELECT DEPT_ID, DEPT_CODE
       FROM DEPARTMENT_IN_CHARGE 
       ORDER BY DEPT_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const options = {
      materialProperty1: materialPropertyResult.rows.map(row => ({
        id: row.PROPERTY1_ID,
        nameJp: row.PROPERTY1_NAME_JP,
        nameVi: row.PROPERTY1_NAME_VI
      })),
      materialProperty2: property2Result.rows.map(row => ({
        id: row.PROPERTY2_ID,
        nameJp: row.PROPERTY2_NAME_JP,
        nameVi: row.PROPERTY2_NAME_VI
      })),
      materialProperty3: property3Result.rows.map(row => ({
        id: row.PROPERTY3_ID,
        nameJp: row.PROPERTY3_NAME_JP,
        nameVi: row.PROPERTY3_NAME_VI
      })),
      materialStatus: materialStatusResult.rows.map(row => ({
        id: row.MATERIAL_STATUS_ID,
        nameJp: row.MATERIAL_STATUS_NAME_JP,
        nameVi: row.MATERIAL_STATUS_NAME_VI
      })),
      ulStatus: ulStatusResult.rows.map(row => ({
        id: row.UL_STATUS_ID,
        nameJp: row.UL_STATUS_NAME_JP,
        nameVi: row.UL_STATUS_NAME_VI
      })),
      materialClass: materialClassResult.rows.map(row => ({
        id: row.CLASS_ID,
        nameJp: row.CLASS_NAME_JP,
        nameVi: row.CLASS_NAME_VI
      })),
      reliabilityLevel: reliabilityLevelResult.rows.map(row => ({
        id: row.LEVEL_ID,
        nameJp: row.LEVEL_NAME_JP,
        nameVi: row.LEVEL_NAME_VI
      })),
      progress: progressStatusResult.rows.map(row => ({
        status_id: row.STATUS_ID,
        status_name: row.STATUS_NAME
      })),
      department: departmentResult.rows.map(row => ({
        dept_id: row.DEPT_ID,
        dept_code: row.DEPT_CODE,
      }))
    };

    res.json({
      success: true,
      data: options
    });

  } catch (error) {
    console.error('Error fetching options:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách options',
      error: error.message
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
});

async function validateForeignKeys(property1Id, property2Id, property3Id, materialStatusId, ulStatusId, materialClassId, reliabilityLevelId) {
  const connection = await getConnection();
  const errors = [];

  try {
    console.log('Validating foreign keys:', {
      property1Id, property2Id, property3Id,
      materialStatusId, ulStatusId, materialClassId, reliabilityLevelId
    });

    // Validate Material Property 1
    if (property1Id && property1Id !== null && property1Id !== '') {
      const result1 = await connection.execute(
        'SELECT COUNT(*) as count FROM MATERIAL_PROPERTY1 WHERE PROPERTY1_ID = :id',
        [property1Id]
      );
      if (result1.rows[0][0] === 0) {
        errors.push('Material Property 1 ID không tồn tại');
      }
    }

    // Validate Material Property 2
    if (property2Id && property2Id !== null && property2Id !== '') {
      const result2 = await connection.execute(
        'SELECT COUNT(*) as count FROM MATERIAL_PROPERTY2 WHERE PROPERTY2_ID = :id',
        [property2Id]
      );
      if (result2.rows[0][0] === 0) {
        errors.push('Material Property 2 ID không tồn tại');
      }
    }

    // Validate Material Property 3
    if (property3Id && property3Id !== null && property3Id !== '') {
      const result3 = await connection.execute(
        'SELECT COUNT(*) as count FROM MATERIAL_PROPERTY3 WHERE PROPERTY3_ID = :id',
        [property3Id]
      );
      if (result3.rows[0][0] === 0) {
        errors.push('Material Property 3 ID không tồn tại');
      }
    }

    // Validate Material Status
    if (materialStatusId && materialStatusId !== null && materialStatusId !== '') {
      const result4 = await connection.execute(
        'SELECT COUNT(*) as count FROM MATERIAL_STATUS WHERE MATERIAL_STATUS_ID = :id',
        [materialStatusId]
      );
      if (result4.rows[0][0] === 0) {
        errors.push('Material Status ID không tồn tại');
      }
    }

    // Validate UL Status
    if (ulStatusId && ulStatusId !== null && ulStatusId !== '') {
      const result5 = await connection.execute(
        'SELECT COUNT(*) as count FROM UL_STATUS WHERE UL_STATUS_ID = :id',
        [ulStatusId]
      );
      if (result5.rows[0][0] === 0) {
        errors.push('UL Status ID không tồn tại');
      }
    }

    // Validate Material Class - skip if null/empty
    if (materialClassId && materialClassId !== null && materialClassId !== '') {
      const result6 = await connection.execute(
        'SELECT COUNT(*) as count FROM MATERIAL_CLASS WHERE CLASS_ID = :id',
        [materialClassId]
      );
      if (result6.rows[0][0] === 0) {
        errors.push('Material Class ID không tồn tại');
      }
    }

    // Validate Reliability Level
    if (reliabilityLevelId && reliabilityLevelId !== null && reliabilityLevelId !== '') {
      const result7 = await connection.execute(
        'SELECT COUNT(*) as count FROM RELIABILITY_LEVEL WHERE LEVEL_ID = :id',
        [reliabilityLevelId]
      );
      if (result7.rows[0][0] === 0) {
        errors.push('Reliability Level ID không tồn tại');
      }
    }

    console.log('Validation errors:', errors);

  } finally {
    await connection.close();
  }

  return errors;
}

// Create new certification
router.post('/create', authenticateToken, async (req, res) => {
  const {
    releaseDate,
    factoryName,
    requestReason,
    layerStructure,
    usage,
    reliabilityLevelId,
    expectedProductionQty,
    massProductionDate,
    materialCertExpected,
    manufacturerName,
    factoryLocation,
    materialName,
    materialClassId,
    materialProperty1Id,
    materialProperty2Id,
    materialProperty3Id,
    materialStatusId,
    ulStatusId,
    notes1,
    notes2
  } = req.body;

  let connection;

  try {
    console.log('Received data:', req.body);

    // Validate foreign keys
    const fkErrors = await validateForeignKeys(
      materialProperty1Id,
      materialProperty2Id,
      materialProperty3Id,
      materialStatusId,
      ulStatusId,
      materialClassId,
      reliabilityLevelId
    );

    if (fkErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu tham chiếu không hợp lệ',
        errors: fkErrors
      });
    }

    connection = await getConnection();

    // Generate new ID
    const idResult = await connection.execute(
      'SELECT NVL(MAX(ID), 0) + 1 as NEW_ID FROM CERTIFICATION'
    );
    const newId = idResult.rows[0][0];

    console.log('Generated ID:', newId);

    // Insert SQL
    const insertSQL = `
      INSERT INTO CERTIFICATION (
        ID, RELEASE_DATE, FACTORY_NAME, REQUEST_REASON, LAYER_STRUCTURE,
        USAGE, RELIABILITY_LEVEL_ID, EXPECTED_PRODUCTION_QTY, MASS_PRODUCTION_DATE,
        MATERIAL_CERT_EXPECTED, MANUFACTURER_NAME, FACTORY_LOCATION,
        MATERIAL_NAME, MATERIAL_CLASS_ID, MATERIAL_PROPERTY1_ID, MATERIAL_PROPERTY2_ID, MATERIAL_PROPERTY3_ID,
        MATERIAL_STATUS, UL_CERT_STATUS, NOTES_1, NOTES_2, IS_DELETED
      ) VALUES (
        :id, 
        TO_DATE(:releaseDate, 'YYYY-MM-DD'), 
        :factoryName, :requestReason,
        :layerStructure, :usage, :reliabilityLevelId, :expectedProductionQty,
        TO_DATE(:massProductionDate, 'YYYY-MM-DD'),
        TO_DATE(:materialCertExpected, 'YYYY-MM-DD'),
        :manufacturerName, :factoryLocation, :materialName, :materialClassId,
        :materialProperty1Id, :materialProperty2Id, :materialProperty3Id,
        :materialStatusId, :ulStatusId, :notes1, :notes2, 0
      )
    `;

    const bindParams = {
      id: newId,
      releaseDate,
      factoryName: factoryName || null,
      requestReason: requestReason || null,
      layerStructure: layerStructure || null,
      usage: usage || null,
      reliabilityLevelId: reliabilityLevelId || null,
      expectedProductionQty: expectedProductionQty || null,
      massProductionDate,
      materialCertExpected,
      manufacturerName: manufacturerName || null,
      factoryLocation: factoryLocation || null,
      materialName: materialName || null,
      materialClassId: materialClassId || null,
      materialProperty1Id: materialProperty1Id || null,
      materialProperty2Id: materialProperty2Id || null,
      materialProperty3Id: materialProperty3Id || null,
      materialStatusId: materialStatusId || null,
      ulStatusId: ulStatusId || null,
      notes1: notes1 || null,
      notes2: notes2 || null
    };

    console.log('Insert SQL:', insertSQL);
    console.log('Bind params:', bindParams);

    await connection.execute(insertSQL, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    await connection.commit();

    console.log('✅ Successfully created certification with ID:', newId);

    res.status(201).json({
      success: true,
      message: 'Tạo certification thành công',
      data: {
        id: newId 
      }
    });

  } catch (error) {
    console.error('Error creating certification:', error);
    console.error('Error details:', {
      message: error.message,
      offset: error.offset,
      errorNum: error.errorNum
    });

    if (connection) {
      await connection.rollback();
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi khi tạo certification',
      error: error.message
    });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
});


router.get('/:id(\\d+)', async (req, res) => {
  const certificationId = req.params.id;
  let connection;

  try {
    const id = parseInt(certificationId);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID không hợp lệ'
      });
    }

    connection = await getConnection();

    // Check if record exists
    const checkResult = await connection.execute(
      'SELECT COUNT(*) as count FROM CERTIFICATION WHERE ID = :id AND IS_DELETED = 0',
      [id],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows[0].COUNT === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy certification'
      });
    }

    // Main query for certification data
    const certResult = await connection.execute(`
      SELECT 
        c.ID,
        c.RELEASE_DATE,
        c.FACTORY_NAME,
        c.REQUEST_REASON,
        c.LAYER_STRUCTURE,
        c.USAGE,
        c.RELIABILITY_LEVEL_ID,
        c.EXPECTED_PRODUCTION_QTY,
        c.MASS_PRODUCTION_DATE,
        c.MATERIAL_CERT_EXPECTED,
        c.MANUFACTURER_NAME,
        c.FACTORY_LOCATION,
        c.MATERIAL_NAME,
        c.MATERIAL_CLASS_ID,
        c.MATERIAL_PROPERTY1_ID,
        c.MATERIAL_PROPERTY2_ID,
        c.MATERIAL_PROPERTY3_ID,
        c.MATERIAL_STATUS,
        c.UL_CERT_STATUS,
        c.NOTES_1,
        c.NOTES_2,
        c.DEPT_ID,
        c.PERSON_IN_CHARGE,
        c.START_DATE,
        c.PD5_REPORT_DEADLINE,
        c.COMPLETION_DEADLINE,
        c.PD5_REPORT_ACTUAL_DATE,
        c.ACTUAL_COMPLETION_DATE,
        c.PROGRESS_ID,
        c.PERSON_DO,
        c.PERSON_CHECK,
        c.TIME_DO,
        c.TIME_CHECK,
        c.TOTAL_TIME,
        ms.MATERIAL_STATUS_NAME_JP, 
        ms.MATERIAL_STATUS_NAME_VI,
        us.UL_STATUS_NAME_JP, 
        us.UL_STATUS_NAME_VI,
        mp1.PROPERTY1_NAME_JP, 
        mp1.PROPERTY1_NAME_VI,
        mp2.PROPERTY2_NAME_JP, 
        mp2.PROPERTY2_NAME_VI,
        mp3.PROPERTY3_NAME_JP, 
        mp3.PROPERTY3_NAME_VI,
        mc.CLASS_NAME_JP, 
        mc.CLASS_NAME_VI,
        rl.LEVEL_NAME_JP, 
        rl.LEVEL_NAME_VI
      FROM CERTIFICATION c
      LEFT JOIN MATERIAL_STATUS ms ON (c.MATERIAL_STATUS = ms.MATERIAL_STATUS_ID AND c.MATERIAL_STATUS IS NOT NULL)
      LEFT JOIN UL_STATUS us ON (c.UL_CERT_STATUS = us.UL_STATUS_ID AND c.UL_CERT_STATUS IS NOT NULL)
      LEFT JOIN MATERIAL_PROPERTY1 mp1 ON (c.MATERIAL_PROPERTY1_ID = mp1.PROPERTY1_ID AND c.MATERIAL_PROPERTY1_ID IS NOT NULL)
      LEFT JOIN MATERIAL_PROPERTY2 mp2 ON (c.MATERIAL_PROPERTY2_ID = mp2.PROPERTY2_ID AND c.MATERIAL_PROPERTY2_ID IS NOT NULL)
      LEFT JOIN MATERIAL_PROPERTY3 mp3 ON (c.MATERIAL_PROPERTY3_ID = mp3.PROPERTY3_ID AND c.MATERIAL_PROPERTY3_ID IS NOT NULL)
      LEFT JOIN MATERIAL_CLASS mc ON (c.MATERIAL_CLASS_ID = mc.CLASS_ID AND c.MATERIAL_CLASS_ID IS NOT NULL)
      LEFT JOIN RELIABILITY_LEVEL rl ON (c.RELIABILITY_LEVEL_ID = rl.LEVEL_ID AND c.RELIABILITY_LEVEL_ID IS NOT NULL)
      WHERE c.ID = :id AND c.IS_DELETED = 0
    `, [id], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    if (certResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy certification'
      });
    }
    const certData = certResult.rows[0];
    let images = [];
    try {
      const imagesResult = await connection.execute(`
        SELECT 
          IMAGE_ID,
          IMAGE_NAME,
          IMAGE_TYPE,
          IMAGE_SIZE
        FROM MATERIAL_IMAGES 
        WHERE MATERIAL_ID = :materialId
      `, [id], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      images = imagesResult.rows.map(img => {
        const baseUrl = `${req.protocol}://${req.get('host')}/api/material-certification/image/${id}/${img.IMAGE_ID}`;
        const processedImage = {
          ID: img.IMAGE_ID,
          id: img.IMAGE_ID,
          imageId: img.IMAGE_ID,
          NAME: img.IMAGE_NAME,
          name: img.IMAGE_NAME,
          fileName: img.IMAGE_NAME,
          FILENAME: img.IMAGE_NAME,
          TYPE: img.IMAGE_TYPE,
          type: img.IMAGE_TYPE,
          imageType: img.IMAGE_TYPE,
          SIZE: img.IMAGE_SIZE,
          size: img.IMAGE_SIZE,
          URL: baseUrl,
          url: baseUrl,
        };
        return processedImage;
      });
    } catch (imageError) {
      console.error('[UL-CERT][DETAIL] Error fetching images:', imageError);
      images = [];
    }

    const responseData = {
      ...certData,
      IMAGES: images,
      IMAGE_COUNT: images.length
    };
    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Error fetching certification:', error);
    console.error('Error details:', {
      message: error.message,
      offset: error.offset,
      errorNum: error.errorNum,
      certificationId: certificationId
    });

    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thông tin certification',
      error: error.message
    });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
});
// Get list - Cũng cần sửa tên cột trong SELECT
router.get('/list-ul', authenticateToken, async (req, res) => {
  let connection;
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const allowedPageSizes = [20, 50, 100];
    const validPageSize = allowedPageSizes.includes(pageSize) ? pageSize : 20;
    const offset = (page - 1) * validPageSize;
    const startRow = offset + 1;
    const endRow = offset + validPageSize;

    const searchConditions = [];
    const searchBindings = {};

    connection = await getConnection();

    let whereClause = "WHERE c.IS_DELETED = 0";
    if (searchConditions.length > 0) {
      whereClause += " AND " + searchConditions.join(" AND ");
    }

   const dataQuery = `
      SELECT * FROM (
        SELECT 
          COUNT(*) OVER() as TOTAL_COUNT,
          c.ID, 
          c.RELEASE_DATE, 
          c.FACTORY_NAME, 
          c.REQUEST_REASON, 
          c.LAYER_STRUCTURE,
          c.USAGE, 
          rl.LEVEL_NAME_VI AS RELIABILITY_LEVEL,
          c.EXPECTED_PRODUCTION_QTY, 
          c.MASS_PRODUCTION_DATE,
          c.MATERIAL_CERT_EXPECTED, 
          c.MANUFACTURER_NAME, 
          c.FACTORY_LOCATION,
          c.MATERIAL_NAME, 
          mc.CLASS_NAME_VI AS MATERIAL_CLASS,
          mp1.PROPERTY1_NAME_VI AS MATERIAL_PROPERTY1,
          mp2.PROPERTY2_NAME_VI AS MATERIAL_PROPERTY2, 
          mp3.PROPERTY3_NAME_VI AS MATERIAL_PROPERTY3,
          ms.MATERIAL_STATUS_NAME_VI AS MATERIAL_STATUS, 
          us.UL_STATUS_NAME_VI AS UL_CERT_STATUS, 
          c.NOTES_1, 
          c.NOTES_2,
          c.DEPT_ID AS DEPARTMENT_IN_CHARGE,
          d.DEPT_CODE AS DEPARTMENT_CODE,
          c.PERSON_IN_CHARGE,
          c.START_DATE,
          c.PD5_REPORT_DEADLINE,
          c.COMPLETION_DEADLINE,
          c.PD5_REPORT_ACTUAL_DATE,
          c.ACTUAL_COMPLETION_DATE,
          c.PROGRESS_ID,
          p.STATUS_NAME AS PROGRESS_STATUS_NAME,
          ROW_NUMBER() OVER (ORDER BY c.ID DESC) AS RN
        FROM CERTIFICATION c
        LEFT JOIN MATERIAL_STATUS ms ON (c.MATERIAL_STATUS = ms.MATERIAL_STATUS_ID AND c.MATERIAL_STATUS IS NOT NULL)
        LEFT JOIN UL_STATUS us ON (c.UL_CERT_STATUS = us.UL_STATUS_ID AND c.UL_CERT_STATUS IS NOT NULL)
        LEFT JOIN MATERIAL_PROPERTY1 mp1 ON (c.MATERIAL_PROPERTY1_ID = mp1.PROPERTY1_ID AND c.MATERIAL_PROPERTY1_ID IS NOT NULL)
        LEFT JOIN MATERIAL_PROPERTY2 mp2 ON (c.MATERIAL_PROPERTY2_ID = mp2.PROPERTY2_ID AND c.MATERIAL_PROPERTY2_ID IS NOT NULL)
        LEFT JOIN MATERIAL_PROPERTY3 mp3 ON (c.MATERIAL_PROPERTY3_ID = mp3.PROPERTY3_ID AND c.MATERIAL_PROPERTY3_ID IS NOT NULL)
        LEFT JOIN MATERIAL_CLASS mc ON (c.MATERIAL_CLASS_ID = mc.CLASS_ID AND c.MATERIAL_CLASS_ID IS NOT NULL)
        LEFT JOIN RELIABILITY_LEVEL rl ON (c.RELIABILITY_LEVEL_ID = rl.LEVEL_ID AND c.RELIABILITY_LEVEL_ID IS NOT NULL)
        LEFT JOIN PROGRESS_STATUS p ON c.PROGRESS_ID = p.STATUS_ID 
        LEFT JOIN DEPARTMENT_IN_CHARGE d ON c.DEPT_ID = d.DEPT_ID
        ${whereClause}
      )
      WHERE RN BETWEEN :startRow AND :endRow
`;
    const dataBindings = {
      ...searchBindings,
      startRow: startRow,
      endRow: endRow
    };

    const result = await connection.execute(
      dataQuery,
      dataBindings,
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const rows = result.rows;
    const totalRecords = rows.length > 0 ? rows[0].TOTAL_COUNT : 0;

    const cleanRows = rows.map(row => {
      const { TOTAL_COUNT, ...cleanRow } = row;
      return cleanRow;
    });

    res.json({
      success: true,
      page,
      pageSize: validPageSize,
      totalRecords,
      totalPages: Math.ceil(totalRecords / validPageSize),
      data: cleanRows
    });

  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      success: false,
      message: "Lỗi truy vấn database",
      error: error.message
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error("Error closing connection:", err);
      }
    }
  }
});

// Get all images for a certification
router.get('/image/:certificationId/:imageId', async (req, res) => {
  const { certificationId, imageId } = req.params;
  let connection;

  try {
    connection = await getConnection();

    const result = await connection.execute(
      `SELECT IMAGE, IMAGE_NAME, IMAGE_TYPE, IMAGE_ID
       FROM MATERIAL_IMAGES 
       WHERE MATERIAL_ID = :materialId AND IMAGE_ID = :imageId`,
      { materialId: parseInt(certificationId, 10), imageId: parseInt(imageId, 10) },
      { outFormat: oracledb.OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    const row = result.rows[0];
    const lob = row.IMAGE;

    if (!lob) {
      return res.status(404).json({ success: false, message: 'No image data' });
    }
    const etag = crypto.createHash('md5')
      .update(`${row.IMAGE_ID}${row.IMAGE_NAME}`)
      .digest('hex');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).send();
    }

    res.setHeader('Content-Type', row.IMAGE_TYPE || 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${row.IMAGE_NAME || 'image.jpg'}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('ETag', etag);

    // Trường hợp Buffer có sẵn
    if (Buffer.isBuffer(lob)) {
      return res.end(lob);
    }

    // Trường hợp LOB stream
    if (lob.pipe) {
      lob.on('error', (err) => {
        console.error('LOB stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Stream error' });
        }
      });
      return lob.pipe(res);
    }
    if (lob.getData) {
      const buffer = await lob.getData();
      return res.end(buffer);
    }

    res.status(500).json({ success: false, message: 'Unsupported image format' });

  } catch (err) {
    console.error('Error fetching image:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error fetching image' });
    }
  } finally {
    if (connection) {
      try { await connection.close(); } catch (err) { }
    }
  }
});


// Fix the upload route to ensure proper data insertion
router.post('/upload-images/:id', authenticateToken, upload.array('images', 10), async (req, res) => {
  const certificationId = req.params.id;
  let connection;
    console.log('📥 Received upload request for certification:', certificationId);
  console.log('📁 Files received:', req.files?.length || 0);
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có file được upload'
      });
    }

    connection = await getConnection();
    const uploadedImages = [];

    for (let file of req.files) {
      try {
        console.log(`Processing file: ${file.originalname}, size: ${file.size}`);

        // Resize + convert
        const processedImage = await sharp(file.buffer)
          .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();

        console.log(`Processed image size: ${processedImage.length}`);

        // Get next sequence ID
        // Get next sequence ID
        let seqResult;
        try {
          seqResult = await connection.execute(
            `SELECT MATERIAL_IMAGES_SEQ.NEXTVAL as IMAGE_ID FROM DUAL`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
        } catch (seqError) {
          console.error('Sequence error:', seqError);
          throw new Error('Database sequence error: MATERIAL_IMAGES_SEQ not found');
        }

        const imageId = seqResult.rows[0].IMAGE_ID;
        console.log('Generated imageId from sequence:', imageId);


        // Insert BLOB with proper data types
        const insertResult = await connection.execute(
          `INSERT INTO MATERIAL_IMAGES 
            (IMAGE_ID, MATERIAL_ID, IMAGE, IMAGE_NAME, IMAGE_TYPE, IMAGE_SIZE)
           VALUES (:imageId, :materialId, :image, :imageName, :imageType, :imageSize)`,
          {
            imageId: parseInt(imageId),
            materialId: parseInt(certificationId),
            image: { val: processedImage, type: oracledb.BLOB },
            imageName: file.originalname,
            imageType: file.mimetype,
            imageSize: processedImage.length
          },
          { autoCommit: false }
        );

        console.log('Insert result:', insertResult);

        // Create consistent response object
        const imageData = {
          id: parseInt(imageId),
          imageId: parseInt(imageId), // Backward compatibility
          name: file.originalname,
          fileName: file.originalname, // Backward compatibility
          size: processedImage.length,
          type: file.mimetype,
          imageType: file.mimetype, // Backward compatibility
          url: `${req.protocol}://${req.get('host')}/api/material-certification/image/${certificationId}/${imageId}`,
          createdDate: new Date().toISOString()
        };

        uploadedImages.push(imageData);

        console.log('Successfully processed and added image:', imageData);

      } catch (fileError) {
        console.error(`Error processing file ${file.originalname}:`, fileError);
        // Continue processing others
      }
    }

    // Only commit if we have successful uploads
    if (uploadedImages.length > 0) {
      await connection.commit();
      console.log('=== COMMIT SUCCESSFUL ===');
      console.log('uploadedImages array:', JSON.stringify(uploadedImages, null, 2));
    } else {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Không có file nào được upload thành công'
      });
    }

    const responseData = {
      success: true,
      images: uploadedImages,
      count: uploadedImages.length,
      message: `Đã upload thành công ${uploadedImages.length} ảnh`
    };
    return res.json(responseData);

  } catch (error) {
    console.error('Error uploading images:', error);
    if (connection) {
      try { await connection.rollback(); } catch (_) { }
    }

    return res.status(500).json({
      success: false,
      message: 'Lỗi khi upload ảnh',
      error: error.message
    });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { }
    }
  }
});

// Fix the list images route
router.get('/images/:certificationId', async (req, res) => {
  const { certificationId } = req.params;
  let connection;

  try {
    connection = await getConnection();
    const result = await connection.execute(
      `SELECT IMAGE_ID, MATERIAL_ID, IMAGE_NAME, IMAGE_TYPE, IMAGE_SIZE
       FROM MATERIAL_IMAGES 
       WHERE MATERIAL_ID = :materialId`,
      { materialId: parseInt(certificationId) }, // Ensure it's a number
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );


    const images = result.rows.map(row => {
      const imageData = {
        id: row.IMAGE_ID,
        name: row.IMAGE_NAME,
        type: row.IMAGE_TYPE,
        size: row.IMAGE_SIZE,
        url: `${req.protocol}://${req.get('host')}/api/material-certification/image/${certificationId}/${row.IMAGE_ID}`,
      };

      console.log('Processed image:', imageData);
      return imageData;
    });

    return res.json({
      success: true,
      images: images,
      count: images.length
    });

  } catch (error) {
    console.error('Error listing images:', error);
    return res.status(500).json({
      success: false,
      message: 'Error listing images',
      error: error.message
    });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { }
    }
  }
});
// Update certification - Add this to your router
router.put('/update/:id', authenticateToken, async (req, res) => {
  const certificationId = req.params.id;
  const {
    releaseDate,
    factoryName,
    requestReason,
    layerStructure,
    usage,
    reliabilityLevelId,
    expectedProductionQty,
    massProductionDate,
    materialCertExpected,
    manufacturerName,
    factoryLocation,
    materialName,
    materialClassId,
    materialProperty1Id,
    materialProperty2Id,
    materialProperty3Id,
    materialStatusId,
    ulStatusId,
    notes1,
    notes2,
    // Progress fields
    departmentInCharge,
    personInCharge,
    startDate,
    pd5ReportDeadline,
    completionDeadline,
    actualCompletionDate,
    pd5ReportActualDate,
    progress,
    factoryCertReady,
    factoryCertStatus,
    factoryLevel,
    priceRequest,
    reportLink,
    pd5StartDate,
    pd5EndDate,
    notes,
    totalTime
  } = req.body;

  let connection;

  try {
    console.log('Updating certification:', certificationId, req.body);

    // Validate that ID is a number
    const id = parseInt(certificationId);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID không hợp lệ'
      });
    }

    // Validate foreign keys if they are provided
    const fkErrors = await validateForeignKeys(
      materialProperty1Id,
      materialProperty2Id,
      materialProperty3Id,
      materialStatusId,
      ulStatusId,
      materialClassId,
      reliabilityLevelId
    );

    if (fkErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu tham chiếu không hợp lệ',
        errors: fkErrors
      });
    }

    connection = await getConnection();

    // Check if record exists and not deleted
    const checkResult = await connection.execute(
      'SELECT COUNT(*) as count FROM CERTIFICATION WHERE ID = :id AND IS_DELETED = 0',
      [id],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows[0].COUNT === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy certification hoặc đã bị xóa'
      });
    }

    // Build dynamic UPDATE query based on provided fields
    const updateFields = [];
    const bindParams = { id: id };

    // Basic certification fields
    if (releaseDate !== undefined) {
      updateFields.push('RELEASE_DATE = TO_DATE(:releaseDate, \'YYYY-MM-DD\')');
      bindParams.releaseDate = releaseDate;
    }
    if (factoryName !== undefined) {
      updateFields.push('FACTORY_NAME = :factoryName');
      bindParams.factoryName = factoryName;
    }
    if (requestReason !== undefined) {
      updateFields.push('REQUEST_REASON = :requestReason');
      bindParams.requestReason = requestReason;
    }
    if (layerStructure !== undefined) {
      updateFields.push('LAYER_STRUCTURE = :layerStructure');
      bindParams.layerStructure = layerStructure;
    }
    if (usage !== undefined) {
      updateFields.push('USAGE = :usage');
      bindParams.usage = usage;
    }
    if (reliabilityLevelId !== undefined) {
      updateFields.push('RELIABILITY_LEVEL_ID = :reliabilityLevelId');
      bindParams.reliabilityLevelId = reliabilityLevelId;
    }
    if (expectedProductionQty !== undefined) {
      updateFields.push('EXPECTED_PRODUCTION_QTY = :expectedProductionQty');
      bindParams.expectedProductionQty = expectedProductionQty;
    }
    if (massProductionDate !== undefined) {
      updateFields.push('MASS_PRODUCTION_DATE = TO_DATE(:massProductionDate, \'YYYY-MM-DD\')');
      bindParams.massProductionDate = massProductionDate;
    }
    if (materialCertExpected !== undefined) {
      updateFields.push('MATERIAL_CERT_EXPECTED = TO_DATE(:materialCertExpected, \'YYYY-MM-DD\')');
      bindParams.materialCertExpected = materialCertExpected;
    }
    if (manufacturerName !== undefined) {
      updateFields.push('MANUFACTURER_NAME = :manufacturerName');
      bindParams.manufacturerName = manufacturerName;
    }
    if (factoryLocation !== undefined) {
      updateFields.push('FACTORY_LOCATION = :factoryLocation');
      bindParams.factoryLocation = factoryLocation;
    }
    if (materialName !== undefined) {
      updateFields.push('MATERIAL_NAME = :materialName');
      bindParams.materialName = materialName;
    }
    if (materialClassId !== undefined) {
      updateFields.push('MATERIAL_CLASS_ID = :materialClassId');
      bindParams.materialClassId = materialClassId;
    }
    if (materialProperty1Id !== undefined) {
      updateFields.push('MATERIAL_PROPERTY1_ID = :materialProperty1Id');
      bindParams.materialProperty1Id = materialProperty1Id;
    }
    if (materialProperty2Id !== undefined) {
      updateFields.push('MATERIAL_PROPERTY2_ID = :materialProperty2Id');
      bindParams.materialProperty2Id = materialProperty2Id;
    }
    if (materialProperty3Id !== undefined) {
      updateFields.push('MATERIAL_PROPERTY3_ID = :materialProperty3Id');
      bindParams.materialProperty3Id = materialProperty3Id;
    }
    if (materialStatusId !== undefined) {
      updateFields.push('MATERIAL_STATUS = :materialStatusId');
      bindParams.materialStatusId = materialStatusId;
    }
    if (ulStatusId !== undefined) {
      updateFields.push('UL_CERT_STATUS = :ulStatusId');
      bindParams.ulStatusId = ulStatusId;
    }
    if (notes1 !== undefined) {
      updateFields.push('NOTES_1 = :notes1');
      bindParams.notes1 = notes1;
    }
    if (notes2 !== undefined) {
      updateFields.push('NOTES_2 = :notes2');
      bindParams.notes2 = notes2;
    }

    // Progress tracking fields - FIXED COLUMN NAMES
    if (departmentInCharge !== undefined) {
      updateFields.push('DEPT_ID = :departmentInCharge');  // Changed from DEPARTMENT_IN_CHARGE to DEPT_ID
      bindParams.departmentInCharge = departmentInCharge;
    }
    if (personInCharge !== undefined) {
      updateFields.push('PERSON_IN_CHARGE = :personInCharge');
      bindParams.personInCharge = personInCharge;
    }
    if (startDate !== undefined) {
      updateFields.push('START_DATE = TO_DATE(:startDate, \'YYYY-MM-DD\')');
      bindParams.startDate = startDate;
    }
    if (pd5ReportDeadline !== undefined) {
      updateFields.push('PD5_REPORT_DEADLINE = TO_DATE(:pd5ReportDeadline, \'YYYY-MM-DD\')');
      bindParams.pd5ReportDeadline = pd5ReportDeadline;
    }
    if (completionDeadline !== undefined) {
      updateFields.push('COMPLETION_DEADLINE = TO_DATE(:completionDeadline, \'YYYY-MM-DD\')');
      bindParams.completionDeadline = completionDeadline;
    }
    if (actualCompletionDate !== undefined) {
      updateFields.push('ACTUAL_COMPLETION_DATE = TO_DATE(:actualCompletionDate, \'YYYY-MM-DD\')');
      bindParams.actualCompletionDate = actualCompletionDate;
    }
    if (pd5ReportActualDate !== undefined) {
      updateFields.push('PD5_REPORT_ACTUAL_DATE = TO_DATE(:pd5ReportActualDate, \'YYYY-MM-DD\')');
      bindParams.pd5ReportActualDate = pd5ReportActualDate;
    }
    
    // FIXED: Only handle progress once with correct column name
    if (progress !== undefined) {
      updateFields.push('PROGRESS_ID = :progress');  // Changed from STATUS_ID to PROGRESS_ID
      bindParams.progress = progress;
    }

    if (factoryCertReady !== undefined) {
      updateFields.push('FACTORY_CERT_READY = :factoryCertReady');
      bindParams.factoryCertReady = factoryCertReady;
    }
    if (factoryCertStatus !== undefined) {
      updateFields.push('FACTORY_CERT_STATUS = :factoryCertStatus');
      bindParams.factoryCertStatus = factoryCertStatus;
    }
    if (factoryLevel !== undefined) {
      updateFields.push('FACTORY_LEVEL = :factoryLevel');
      bindParams.factoryLevel = factoryLevel;
    }
    if (priceRequest !== undefined) {
      updateFields.push('PRICE_REQUEST = :priceRequest');
      bindParams.priceRequest = priceRequest;
    }
    if (reportLink !== undefined) {
      updateFields.push('REPORT_LINK = :reportLink');
      bindParams.reportLink = reportLink;
    }
    if (pd5StartDate !== undefined) {
      updateFields.push('PD5_START_DATE = TO_DATE(:pd5StartDate, \'YYYY-MM-DD\')');
      bindParams.pd5StartDate = pd5StartDate;
    }
    if (pd5EndDate !== undefined) {
      updateFields.push('PD5_END_DATE = TO_DATE(:pd5EndDate, \'YYYY-MM-DD\')');
      bindParams.pd5EndDate = pd5EndDate;
    }
    if (notes !== undefined) {
      updateFields.push('NOTES = :notes');
      bindParams.notes = notes;
    }
    if (totalTime !== undefined) {
      updateFields.push('TOTAL_TIME = :totalTime');
      bindParams.totalTime = totalTime;
    }

    // If no fields to update, return error
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có dữ liệu để cập nhật'
      });
    }

    // Build and execute UPDATE query
    const updateSQL = `
      UPDATE CERTIFICATION 
      SET ${updateFields.join(', ')}
      WHERE ID = :id AND IS_DELETED = 0
    `;
    const result = await connection.execute(updateSQL, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy certification để cập nhật'
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'Cập nhật certification thành công',
      data: {
        id: id,
        updatedFields: updateFields.length
      }
    });

  } catch (error) {
    console.error('Error updating certification:', error);
    console.error('Error details:', {
      message: error.message,
      offset: error.offset,
      errorNum: error.errorNum
    });

    if (connection) {
      await connection.rollback();
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật certification',
      error: error.message
    });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
});
// Thêm route này vào file backend của bạn (sau các route khác)
router.delete('/image/:certificationId/:imageId', authenticateToken, async (req, res) => {
  const { certificationId, imageId } = req.params;
  let connection;

  try {

    // Validate parameters
    const certId = parseInt(certificationId);
    const imgId = parseInt(imageId);

    if (isNaN(certId) || isNaN(imgId)) {
      return res.status(400).json({
        success: false,
        message: 'ID không hợp lệ'
      });
    }

    connection = await getConnection();

    // CÁCH 1: Tách làm 2 query riêng biệt
    // Check if image exists - chỉ count
    const countResult = await connection.execute(
      `SELECT COUNT(*) as COUNT_RECORDS
       FROM MATERIAL_IMAGES 
       WHERE MATERIAL_ID = :materialId AND IMAGE_ID = :imageId`,
      { materialId: certId, imageId: imgId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log('Image count result:', countResult.rows[0]);

    if (countResult.rows[0].COUNT_RECORDS === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy ảnh để xóa'
      });
    }

    // Lấy thông tin image name (optional, for logging)
    const imageInfoResult = await connection.execute(
      `SELECT IMAGE_NAME, IMAGE_TYPE
       FROM MATERIAL_IMAGES 
       WHERE MATERIAL_ID = :materialId AND IMAGE_ID = :imageId`,
      { materialId: certId, imageId: imgId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const imageName = imageInfoResult.rows[0]?.IMAGE_NAME || 'unknown';
    console.log('Deleting image:', imageName);

    // Delete the image
    const deleteResult = await connection.execute(
      `DELETE FROM MATERIAL_IMAGES 
       WHERE MATERIAL_ID = :materialId AND IMAGE_ID = :imageId`,
      { materialId: certId, imageId: imgId },
      { autoCommit: false }
    );

    console.log('Delete result - rows affected:', deleteResult.rowsAffected);

    if (deleteResult.rowsAffected === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Không thể xóa ảnh'
      });
    }

    // Commit the transaction
    await connection.commit();
    console.log('Image deleted successfully:', imageName);

    return res.json({
      success: true,
      message: 'Xóa ảnh thành công',
      deletedImageId: imgId,
      deletedImageName: imageName
    });

  } catch (error) {
    console.error('Error deleting image:', error);

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError);
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa ảnh',
      error: error.message
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
});

router.post('/export/excel', authenticateToken, async (req, res) => {
  let connection;
  let tempFilePath = null;
  let outputPath = null;

  try {
    const { ids, filters } = req.body;

    connection = await getConnection();

    // Đường dẫn đến file template
    const templatePath = path.join(__dirname, '../public/template/TemplateCertification.xlsx');

    // Kiểm tra file template có tồn tại không
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({
        success: false,
        message: 'Template file không tồn tại'
      });
    }

    // Tạo thư mục temp nếu chưa có
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Tạo tên file output với timestamp
    const timestamp = Date.now();
    const outputFileName = `Certification_Export_${timestamp}.xlsx`;
    outputPath = path.join(tempDir, outputFileName);
    tempFilePath = outputPath;
    const workbook = await XlsxPopulate.fromFileAsync(templatePath);

    const worksheet = workbook.sheet(0);
    let query = `
      SELECT 
        c.ID,
        c.RELEASE_DATE,
        c.FACTORY_NAME,
        c.REQUEST_REASON,
        c.LAYER_STRUCTURE,
        c.USAGE,
        c.EXPECTED_PRODUCTION_QTY,
        c.MASS_PRODUCTION_DATE,
        c.MATERIAL_CERT_EXPECTED,
        c.MANUFACTURER_NAME,
        c.FACTORY_LOCATION,
        c.MATERIAL_NAME,
        c.NOTES_1,
        c.NOTES_2,
        c.DEPT_ID,
        c.PERSON_IN_CHARGE,
        c.START_DATE,
        c.PD5_REPORT_DEADLINE,
        c.COMPLETION_DEADLINE,
        c.PD5_REPORT_ACTUAL_DATE,
        c.ACTUAL_COMPLETION_DATE,
        c.PROGRESS_ID,
        c.PERSON_DO,
        c.PERSON_CHECK,
        c.TIME_DO,
        c.TIME_CHECK,
        c.TOTAL_TIME,
        ms.MATERIAL_STATUS_NAME_JP, 
        ms.MATERIAL_STATUS_NAME_VI,
        us.UL_STATUS_NAME_JP, 
        us.UL_STATUS_NAME_VI,
        mp1.PROPERTY1_NAME_JP, 
        mp1.PROPERTY1_NAME_VI,
        mp2.PROPERTY2_NAME_JP, 
        mp2.PROPERTY2_NAME_VI,
        mp3.PROPERTY3_NAME_JP, 
        mp3.PROPERTY3_NAME_VI,
        mc.CLASS_NAME_JP, 
        mc.CLASS_NAME_VI,
        rl.LEVEL_NAME_JP, 
        rl.LEVEL_NAME_VI
      FROM CERTIFICATION c
      LEFT JOIN MATERIAL_STATUS ms ON c.MATERIAL_STATUS = ms.MATERIAL_STATUS_ID
      LEFT JOIN UL_STATUS us ON c.UL_CERT_STATUS = us.UL_STATUS_ID
      LEFT JOIN MATERIAL_PROPERTY1 mp1 ON c.MATERIAL_PROPERTY1_ID = mp1.PROPERTY1_ID
      LEFT JOIN MATERIAL_PROPERTY2 mp2 ON c.MATERIAL_PROPERTY2_ID = mp2.PROPERTY2_ID
      LEFT JOIN MATERIAL_PROPERTY3 mp3 ON c.MATERIAL_PROPERTY3_ID = mp3.PROPERTY3_ID
      LEFT JOIN MATERIAL_CLASS mc ON c.MATERIAL_CLASS_ID = mc.CLASS_ID
      LEFT JOIN RELIABILITY_LEVEL rl ON c.RELIABILITY_LEVEL_ID = rl.LEVEL_ID
      WHERE c.IS_DELETED = 0
    `;

    let queryParams = [];

    // Nếu có IDs cụ thể
    if (ids && Array.isArray(ids) && ids.length > 0) {
      const placeholders = ids.map((_, index) => `:id${index}`).join(',');
      query += ` AND c.ID IN (${placeholders})`;
      ids.forEach((id, index) => {
        queryParams.push(id);
      });
    }

    // Thêm các filters khác nếu cần
    if (filters) {
      if (filters.factoryName) {
        query += ` AND UPPER(c.FACTORY_NAME) LIKE UPPER(:factoryName)`;
        queryParams.push(`%${filters.factoryName}%`);
      }
      if (filters.materialName) {
        query += ` AND UPPER(c.MATERIAL_NAME) LIKE UPPER(:materialName)`;
        queryParams.push(`%${filters.materialName}%`);
      }
      if (filters.startDate) {
        query += ` AND c.START_DATE >= :startDate`;
        queryParams.push(new Date(filters.startDate));
      }
      if (filters.endDate) {
        query += ` AND c.START_DATE <= :endDate`;
        queryParams.push(new Date(filters.endDate));
      }
    }

    query += ` ORDER BY c.ID DESC`;

    // Thực hiện query
    const result = await connection.execute(query, queryParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });

    const certifications = result.rows;

    if (certifications.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu để export'
      });
    }

    // Ghi dữ liệu vào Excel - chỉ lấy certification đầu tiên
    const cert = certifications[0];

    // Helper function để format date
    const formatDate = (date) => {
      if (!date) return '';
      if (date instanceof Date) {
        return date.toLocaleDateString('vi-VN');
      }
      return date;
    };


    worksheet.cell('E7').value(cert.REQUEST_REASON || '');

    worksheet.cell('L9').value(cert.LAYER_STRUCTURE || '');

    worksheet.cell('L10').value(cert.USAGE || '');

    worksheet.cell('L11').value(cert.LEVEL_NAME_VI || '');
    worksheet.cell('T12').value(cert.EXPECTED_PRODUCTION_QTY || '');
    worksheet.cell('T13').value(cert.MASS_PRODUCTION_DATE || '');
    worksheet.cell('T14').value(cert.MATERIAL_CERT_EXPECTED || '');
    worksheet.cell('J15').value(cert.MANUFACTURER_NAME || '');
    worksheet.cell('J16').value(cert.FACTORY_LOCATION || '');
    worksheet.cell('J17').value(cert.MATERIAL_NAME || '');
    worksheet.cell('M18').value(cert.CLASS_NAME_VI || '');
    worksheet.cell('J20').value(cert.PROPERTY1_NAME_VI || '');
    worksheet.cell('U20').value(cert.PROPERTY2_NAME_VI || '');
    worksheet.cell('AA20').value(cert.PROPERTY3_NAME_VI || '');
    worksheet.cell('J22').value(cert.UL_STATUS_NAME_VI || '');


    await workbook.toFileAsync(outputPath);

    // Trả về file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${outputFileName}"`);

    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);

    // Cleanup file sau khi gửi xong
    fileStream.on('end', () => {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        setTimeout(() => {
          try {
            fs.unlinkSync(tempFilePath);
          } catch (error) {
            console.error('Error cleaning up temp file:', error);
          }
        }, 1000);
      }
    });

  } catch (error) {
    console.error('Error exporting to Excel:', error);
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.error('Error cleaning up temp file after error:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi khi export Excel',
      error: error.message
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
});

module.exports = router;