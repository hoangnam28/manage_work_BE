const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { authenticateToken, checkEditPermission } = require('../middleware/auth');

// Lấy danh sách material core
router.get('/list', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    
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
        top_foil_cu_weight,
        bot_foil_cu_weight,
        tg_min,
        tg_max,
        center_glass,
        dk_01g,
        df_01g,
        is_hf,
        data_source,
        filename
       FROM material_core
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
    const top_foil_cu_weights = Array.isArray(data.top_foil_cu_weight) 
      ? data.top_foil_cu_weight 
      : [data.top_foil_cu_weight];

    const createdRecords = [];

    for (const weight of top_foil_cu_weights) {
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
        top_foil_cu_weight: weight,
        bot_foil_cu_weight: data.bot_foil_cu_weight,
        tg_min: data.tg_min,
        tg_max: data.tg_max,
        center_glass: data.center_glass,
        dk_01g: data.dk_01g,
        df_01g: data.df_01g,
        is_hf: data.is_hf || 'FALSE',
        data_source: data.data_source,
        filename: data.filename
      };

      await connection.execute(
        `INSERT INTO material_core (
          id, requester_name, request_date, handler, 
          status, complete_date, vendor, family,
          prepreg_count, nominal_thickness, spec_thickness,
          preference_class, use_type, top_foil_cu_weight,
          bot_foil_cu_weight, tg_min, tg_max, center_glass,
          dk_01g, df_01g, is_hf, data_source, filename
        ) VALUES (
          :id, :requester_name, :request_date, :handler,
          :status, :complete_date, :vendor, :family,
          :prepreg_count, :nominal_thickness, :spec_thickness,
          :preference_class, :use_type, :top_foil_cu_weight,
          :bot_foil_cu_weight, :tg_min, :tg_max, :center_glass,
          :dk_01g, :df_01g, :is_hf, :data_source, :filename
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

// Cập nhật material core
router.put('/update/:id', authenticateToken, checkEditPermission, async (req, res) => {
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

    // Validate status
    if (updateData.status && !['Approve', 'Cancel', 'Pending'].includes(updateData.status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    // Validate top_foil_cu_weight
    if (updateData.top_foil_cu_weight && !['L', 'H', '1', '2'].includes(updateData.top_foil_cu_weight)) {
      return res.status(400).json({ message: 'Giá trị top_foil_cu_weight không hợp lệ' });
    }

    // Validate is_hf
    if (updateData.is_hf && !['TRUE', 'FALSE'].includes(updateData.is_hf)) {
      return res.status(400).json({ message: 'Giá trị is_hf không hợp lệ' });
    }

    // Build update query dynamically
    const updateFields = [];
    const bindParams = { id };

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        updateFields.push(`${key} = :${key}`);
        bindParams[key] = updateData[key];
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

    // Get updated record
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

// Xóa material core
router.delete('/delete/:id', authenticateToken, checkEditPermission, async (req, res) => {
  const { id } = req.params;
  let connection;

  try {
    if (!id) {
      return res.status(400).json({
        message: 'ID không hợp lệ'
      });
    }

    connection = await database.getConnection();

    const result = await connection.execute(
      `DELETE FROM material_core WHERE id = :id`,
      { id },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }

    res.json({
      message: 'Xóa thành công',
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

module.exports = router;
