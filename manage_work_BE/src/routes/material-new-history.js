const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
require('dotenv').config();

// Lấy lịch sử của một material core
router.get('/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT 
        h.*,
        COALESCE(u.username, h.created_by) as user_fullname
      FROM material_new_history h
      LEFT JOIN users u ON h.created_by = u.username
      WHERE h.material_new_id = :id
      ORDER BY h.created_at DESC`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('Error fetching material core history:', err);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy lịch sử',
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

// Thêm bản ghi lịch sử với các trường chi tiết
async function addHistoryNewRecord(connection, { materialNewId, actionType, createdBy, data }) {
  try {
    let historyId;
    
    // Try to use sequence first
    try {
      const seqResult = await connection.execute(
        `SELECT material_new_history_seq.NEXTVAL FROM DUAL`
      );
      historyId = seqResult.rows[0][0];
    } catch (seqError) {
      console.log('Sequence not found, using MAX+1 approach');
      // If sequence doesn't exist, use MAX+1
      const maxResult = await connection.execute(
        `SELECT NVL(MAX(id), 0) + 1 FROM material_new_history`
      );
      historyId = maxResult.rows[0][0];
      console.log('Using MAX+1 for history ID:', historyId);
    }

    // Chuẩn hóa key về dạng thường
    const normalizedData = {};
    Object.keys(data || {}).forEach(key => {
      normalizedData[key.toLowerCase()] = data[key];
    });

    const result = await connection.execute(
      `INSERT INTO material_new_history (
        id, material_new_id, action_type, created_by, created_at,
        vendor, family_core, family_pp, is_hf, material_type,
        erp, erp_vendor, tg, is_caf, bord_type, plastic,
        file_name, data
      ) VALUES (
        :id, :materialNewId, :actionType, :createdBy, CURRENT_TIMESTAMP,
        :vendor, :family_core, :family_pp, :is_hf, :material_type,
        :erp, :erp_vendor, :tg, :is_caf, :bord_type, :plastic,
        :file_name, :data
      )`,
      {
        id: historyId,
        materialNewId,
        actionType,
        createdBy,
        vendor: normalizedData.vendor,
        family_core: normalizedData.family_core,
        family_pp: normalizedData.family_pp,
        is_hf: toNumberBool(normalizedData.is_hf),
        material_type: normalizedData.material_type,
        erp: toNumber(normalizedData.erp),
        erp_vendor: normalizedData.erp_vendor,
        tg: normalizedData.tg,
        is_caf: toNumberBool(normalizedData.is_caf),
        bord_type: normalizedData.bord_type,
        plastic: normalizedData.plastic,
        file_name: normalizedData.file_name,
        data: normalizedData.data,
      },
      { autoCommit: true }
    );
    return result;
  } catch (error) {
    console.error('Error adding history record:', error);
    throw error;
  }
}

function toNumberBool(val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    if (val.toUpperCase() === 'TRUE') return 1;
    if (val.toUpperCase() === 'FALSE') return 0;
    if (!isNaN(Number(val))) return Number(val);
  }
  return null;
}

function toNumber(val) {
  if (val === undefined || val === null || val === '') return null;
  if (!isNaN(Number(val))) return Number(val);
  return null;
}

module.exports = {
  router,
  addHistoryNewRecord
};