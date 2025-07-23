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
      FROM material_pp_history h
      LEFT JOIN users u ON h.created_by = u.username
      WHERE h.material_pp_id = :id
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
async function addHistoryPpRecord(connection, { materialPpId, actionType, createdBy, data }) {
  try {
    let historyId;
    
    // Try to use sequence first
    try {
      const seqResult = await connection.execute(
        `SELECT material_pp_history_seq.NEXTVAL FROM DUAL`
      );
      historyId = seqResult.rows[0][0];
      console.log('Using sequence for history ID:', historyId);
    } catch (seqError) {
      console.log('Sequence not found, using MAX+1 approach');
      // If sequence doesn't exist, use MAX+1
      const maxResult = await connection.execute(
        `SELECT NVL(MAX(id), 0) + 1 FROM material_core_history`
      );
      historyId = maxResult.rows[0][0];
      console.log('Using MAX+1 for history ID:', historyId);
    }

    const result = await connection.execute(
      `INSERT INTO material_pp_history (
        id, material_pp_id, action_type, created_by, created_at,
        vendor, family, glass_style, resin_percentage, rav_thickness,
        preference_class, use_type, pp_type, tg_min, tg_max,
        dk_01g, df_01g,
        dk_0_001ghz, df_0_001ghz, dk_0_01ghz, df_0_01ghz,
        dk_0_02ghz, df_0_02ghz, dk_2ghz, df_2ghz,
        dk_2_45ghz, df_2_45ghz, dk_3ghz, df_3ghz,
        dk_4ghz, df_4ghz, dk_5ghz, df_5ghz,
        dk_6ghz, df_6ghz, dk_7ghz, df_7ghz,
        dk_8ghz, df_8ghz, dk_9ghz, df_9ghz,
        dk_10ghz, df_10ghz, dk_15ghz, df_15ghz,
        dk_16ghz, df_16ghz, dk_20ghz, df_20ghz,
        dk_25ghz, df_25ghz, is_hf, data_source, filename
      ) VALUES (
        :id, :materialPpId, :actionType, :createdBy, CURRENT_TIMESTAMP,
        :vendor, :family, :glassStyle, :resinPercentage, :ravThickness,
        :preferenceClass, :useType, :ppType, :tgMin, :tgMax,
        :dk_01g, :df_01g,
        :dk_0_001ghz, :df_0_001ghz, :dk_0_01ghz, :df_0_01ghz,
        :dk_0_02ghz, :df_0_02ghz, :dk_2ghz, :df_2ghz,
        :dk_2_45ghz, :df_2_45ghz, :dk_3ghz, :df_3ghz,
        :dk_4ghz, :df_4ghz, :dk_5ghz, :df_5ghz,
        :dk_6ghz, :df_6ghz, :dk_7ghz, :df_7ghz,
        :dk_8ghz, :df_8ghz, :dk_9ghz, :df_9ghz,
        :dk_10ghz, :df_10ghz, :dk_15ghz, :df_15ghz,
        :dk_16ghz, :df_16ghz, :dk_20ghz, :df_20ghz,
        :dk_25ghz, :df_25ghz, :is_hf, :data_source, :filename
      )`,
      {
        id: historyId,
        materialPpId,
        actionType,
        createdBy,
        vendor: data.vendor,
        family: data.family,
        glassStyle: data.glass_style,
        resinPercentage: data.resin_percentage,
        ravThickness: data.rav_thickness,
        preferenceClass: data.preference_class,
        useType: data.use_type,
        ppType: data.pp_type,
        tgMin: data.tg_min,
        tgMax: data.tg_max,
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
        is_hf: data.is_hf,
        data_source: data.data_source,
        filename: data.filename
      },
      { autoCommit: true }
    );
    
    console.log(`History record created successfully with ID: ${historyId}`);
    return result;
  } catch (error) {
    console.error('Error adding history record:', error);
    throw error;
  }
}

module.exports = {
  router,
  addHistoryPpRecord
};