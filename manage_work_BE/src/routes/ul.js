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


router.get('/list-ul', authenticateToken, async (req, res) => {
  let connection;
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const allowedPageSizes = [20, 50, 100];
    const validPageSize = allowedPageSizes.includes(pageSize) ? pageSize : 20;
    const offset = (page - 1) * validPageSize;

    const { supplier, material_name, customer_name } = req.query;

    const searchConditions = [];
    const searchBindings = {};

    if (supplier) {
      searchConditions.push(`LOWER(supplier) LIKE :supplier`);
      searchBindings.supplier = `%${supplier.toLowerCase()}%`;
    }

    if (material_name) {
      searchConditions.push(`LOWER(material_name) LIKE :material_name`);
      searchBindings.material_name = `%${material_name.toLowerCase()}%`;
    }

    if (customer_name) {
      searchConditions.push(`LOWER(customer_name) LIKE :customer_name`);
      searchBindings.customer_name = `%${customer_name.toLowerCase()}%`;
    }

    connection = await database.getConnection();

    let whereClause = "WHERE is_deleted = 0";
    if (searchConditions.length > 0) {
      whereClause += " AND " + searchConditions.join(" AND ");
    }

    // Query tổng số bản ghi
    const countQuery = `
      SELECT COUNT(*) as total
      FROM ul_material
      ${whereClause}
    `;
    const countResult = await connection.execute(countQuery, searchBindings, { outFormat: database.OBJECT });
    const totalRecords = countResult.rows[0].TOTAL;

    // Query phân trang
    const dataQuery = `
      SELECT *
      FROM (
        SELECT a.*, ROW_NUMBER() OVER (ORDER BY id DESC) as rn
        FROM (
          SELECT
            ID,
            SUPPLIER,
            MANUFACTURING,
            MATERIAL_NAME,
            PP,
            TYPE,
            STRUCTURE,
            LAYER,
            LEVEL_NO,
            PRODUCT_CODE,
            CUSTOMER_NAME,
            DEPARTMENT,
            HANDLER,
            START_DATE,
            PROPOSED_DEADLINE,
            SUMMARY_DAY,
            REAL_DATE,
            DEADLINE,
            MASS_DAY,
            MASS_PRODUCT,
            CONFIRM,
            CONFIRM_NAME,
            OTHER_LEVEL,
            REQUEST_REPORT,
            NOTE
          FROM ul_material
          ${whereClause}
          ORDER BY ID DESC
        ) a
      )
      WHERE rn BETWEEN :startRow AND :endRow
      
    `;

    const dataBindings = {
      ...searchBindings,
      startRow: offset + 1,
      endRow: offset + validPageSize
    };

    const dataResult = await connection.execute(dataQuery, dataBindings, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const rows = dataResult.rows;

    res.json({
      page,
      pageSize: validPageSize,
      totalRecords,
      totalPages: Math.ceil(totalRecords / validPageSize),
      data: rows
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
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

// Create new UL material
router.post('/create-ul', authenticateToken, async (req, res) => {
  let connection;
  try {
    const {
      supplier,
      manufaturing,
      material_name,
      pp,
      type,
      structure,
      layer,
      level_no,
      product_code,
      customer_name,
      department,
      handler,
      start_date,
      proposed_deadline,
      summary_day,
      real_date,
      deadline,
      mass_day,
      mass_product,
      confirm,
      confirm_name,
      other_level,
      request_report,
      certification_date,
      note
    } = req.body;

    connection = await database.getConnection();

    const insertQuery = `
      INSERT INTO ul_material (
        supplier, manufaturing, material_name, pp, type, structure, layer, level_no,
        product_code, customer_name, department, handler, start_date, proposed_deadline,
        summary_day, real_date, deadline, mass_day, mass_product, confirm, confirm_name,
        other_level, request_report, certification_date, note, created_at, updated_at, is_deleted
      ) VALUES (
        :supplier, :manufaturing, :material_name, :pp, :type, :structure, :layer, :level_no,
        :product_code, :customer_name, :department, :handler, :start_date, :proposed_deadline,
        :summary_day, :real_date, :deadline, :mass_day, :mass_product, :confirm, :confirm_name,
        :other_level, :request_report, :certification_date, :note, SYSDATE, SYSDATE, 0
      )
    `;

    const bindings = {
      supplier,
      manufaturing,
      material_name,
      pp,
      type,
      structure,
      layer,
      level_no,
      product_code,
      customer_name,
      department,
      handler,
      start_date,
      proposed_deadline,
      summary_day,
      real_date,
      deadline,
      mass_day,
      mass_product,
      confirm,
      confirm_name,
      other_level,
      request_report,
      certification_date,
      note
    };

    await connection.execute(insertQuery, bindings);
    await connection.commit();

    res.status(201).json({ message: 'UL material created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
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

// Update UL material
router.put('/update-ul/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const {
      supplier,
      manufaturing,
      material_name,
      pp,
      type,
      structure,
      layer,
      level_no,
      product_code,
      customer_name,
      department,
      handler,
      start_date,
      proposed_deadline,
      summary_day,
      real_date,
      deadline,
      mass_day,
      mass_product,
      confirm,
      confirm_name,
      other_level,
      request_report,
      certification_date,
      note
    } = req.body;

    connection = await database.getConnection();

    const updateQuery = `
      UPDATE ul_material SET
        supplier = :supplier,
        manufaturing = :manufaturing,
        material_name = :material_name,
        pp = :pp,
        type = :type,
        structure = :structure,
        layer = :layer,
        level_no = :level_no,
        product_code = :product_code,
        customer_name = :customer_name,
        department = :department,
        handler = :handler,
        start_date = :start_date,
        proposed_deadline = :proposed_deadline,
        summary_day = :summary_day,
        real_date = :real_date,
        deadline = :deadline,
        mass_day = :mass_day,
        mass_product = :mass_product,
        confirm = :confirm,
        confirm_name = :confirm_name,
        other_level = :other_level,
        request_report = :request_report,
        certification_date = :certification_date,
        note = :note,
        updated_at = SYSDATE
      WHERE id = :id AND is_deleted = 0
    `;

    const bindings = {
      id,
      supplier,
      manufaturing,
      material_name,
      pp,
      type,
      structure,
      layer,
      level_no,
      product_code,
      customer_name,
      department,
      handler,
      start_date,
      proposed_deadline,
      summary_day,
      real_date,
      deadline,
      mass_day,
      mass_product,
      confirm,
      confirm_name,
      other_level,
      request_report,
      certification_date,
      note
    };

    const result = await connection.execute(updateQuery, bindings);
    
    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'UL material not found' });
    }

    await connection.commit();
    res.json({ message: 'UL material updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
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

// Delete UL material (soft delete)
router.delete('/delete-ul/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await database.getConnection();

    const deleteQuery = `
      UPDATE ul_material SET
        is_deleted = 1,
        updated_at = SYSDATE
      WHERE id = :id AND is_deleted = 0
    `;

    const result = await connection.execute(deleteQuery, { id });
    
    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'UL material not found' });
    }

    await connection.commit();
    res.json({ message: 'UL material deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
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

// Export UL material to Excel
router.get('/export-ul', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();

    const query = `
      SELECT
        supplier, manufaturing, material_name, pp, type, structure, layer, level_no,
        product_code, customer_name, department, handler, start_date, proposed_deadline,
        summary_day, real_date, deadline, mass_day, mass_product, confirm, confirm_name,
        other_level, request_report, certification_date, note
      FROM ul_material
      WHERE is_deleted = 0
      ORDER BY id DESC
    `;

    const result = await connection.execute(query, [], { outFormat: database.OBJECT });
    const data = result.rows;

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'UL Material');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=ul_material_export.xlsx');
    res.send(buffer);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
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