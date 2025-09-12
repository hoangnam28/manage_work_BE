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

// Validate foreign keys function
// Validate foreign keys function - Updated to handle nulls properly
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

// Create new certification - Fixed data mapping

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
    
    // Insert SQL - Sử dụng tên cột chính xác từ database
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

// Get certification by ID - Cũng cần sửa JOIN
router.get('/:id(\\d+)', async (req, res) => {
  const certificationId = req.params.id;
  let connection;
  
  try {
    console.log('[UL-CERT][DETAIL] params:', { certificationId });
    // Validate that ID is a number
    const id = parseInt(certificationId);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID không hợp lệ'
      });
    }
    
    connection = await getConnection();
    
    console.log('[UL-CERT][DETAIL] Getting certification with ID:', id);
    
    // First, check if record exists
    const checkResult = await connection.execute(
      'SELECT COUNT(*) as count FROM CERTIFICATION WHERE ID = :id AND IS_DELETED = 0',
      [id],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    console.log('[UL-CERT][DETAIL] Record exists check:', checkResult.rows[0].COUNT);
    
    if (checkResult.rows[0].COUNT === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy certification'
      });
    }
    
    // Main query with careful LEFT JOINs
    const result = await connection.execute(`
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
        c.MATERIAL_CLASS,
        c.MATERIAL_CLASS_ID,
        c.MATERIAL_PROPERTY1,
        c.MATERIAL_PROPERTY1_ID,
        c.MATERIAL_PROPERTY2,
        c.MATERIAL_PROPERTY2_ID,
        c.MATERIAL_PROPERTY3,
        c.MATERIAL_PROPERTY3_ID,
        c.MATERIAL_STATUS,
        c.UL_CERT_STATUS,
        c.NOTES_1,
        c.NOTES_2,
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
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy certification'
      });
    }
    
    const row = result.rows[0];
    console.log('[UL-CERT][DETAIL] Found certification row keys:', Object.keys(row));
    console.log('[UL-CERT][DETAIL] Sample row:', row);
    
    res.json({
      success: true,
      data: row
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

    console.log('[UL-CERT][LIST] query:', req.query);
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
          ROW_NUMBER() OVER (ORDER BY c.ID DESC) AS RN
        FROM CERTIFICATION c
        LEFT JOIN MATERIAL_STATUS ms ON (c.MATERIAL_STATUS = ms.MATERIAL_STATUS_ID AND c.MATERIAL_STATUS IS NOT NULL)
        LEFT JOIN UL_STATUS us ON (c.UL_CERT_STATUS = us.UL_STATUS_ID AND c.UL_CERT_STATUS IS NOT NULL)
        LEFT JOIN MATERIAL_PROPERTY1 mp1 ON (c.MATERIAL_PROPERTY1_ID = mp1.PROPERTY1_ID AND c.MATERIAL_PROPERTY1_ID IS NOT NULL)
        LEFT JOIN MATERIAL_PROPERTY2 mp2 ON (c.MATERIAL_PROPERTY2_ID = mp2.PROPERTY2_ID AND c.MATERIAL_PROPERTY2_ID IS NOT NULL)
        LEFT JOIN MATERIAL_PROPERTY3 mp3 ON (c.MATERIAL_PROPERTY3_ID = mp3.PROPERTY3_ID AND c.MATERIAL_PROPERTY3_ID IS NOT NULL)
        LEFT JOIN MATERIAL_CLASS mc ON (c.MATERIAL_CLASS_ID = mc.CLASS_ID AND c.MATERIAL_CLASS_ID IS NOT NULL)
        LEFT JOIN RELIABILITY_LEVEL rl ON (c.RELIABILITY_LEVEL_ID = rl.LEVEL_ID AND c.RELIABILITY_LEVEL_ID IS NOT NULL)
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
    console.log('[UL-CERT][LIST] fetched rows:', rows.length);
    if (rows.length > 0) {
      console.log('[UL-CERT][LIST] first row keys:', Object.keys(rows[0]));
      console.log('[UL-CERT][LIST] first row sample:', rows[0]);
    }
    const totalRecords = rows.length > 0 ? rows[0].TOTAL_COUNT : 0;

    // Remove TOTAL_COUNT from each row
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

module.exports = router;