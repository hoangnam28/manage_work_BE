const express = require('express');
const router = express.Router();
const database = require('../config/database');
const oracledb = require('oracledb');
const { authenticateToken } = require('../middleware/auth');
require('dotenv').config();

// ========================================
// PROJECT ROUTES
// ========================================

// GET ALL PROJECTS BY BUSINESS - ✅ SỬA ROUTE
router.get('/business/:businessId', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT p.ID, p.BUSINESS_ID, p.NAME, p.CODE, p.DESCRIPTION, 
              p.PROJECT_TEMPLATE_ID,
              p.CREATED_BY, TO_CHAR(p.CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') as CREATED_AT, 
              u.USERNAME as CREATOR_NAME
       FROM INPLAN.PROJECTS p
       LEFT JOIN INPLAN.USERS u ON p.CREATED_BY = u.USER_ID
       WHERE p.BUSINESS_ID = :businessId AND p.IS_DELETED = 0
       ORDER BY p.CREATED_AT DESC`,
      [req.params.businessId]
    );

    const projects = result.rows.map(row => ({
      id: row[0],
      businessId: row[1],
      name: row[2],
      code: row[3],
      description: row[4],
      projectTemplateId: row[5],
      createdBy: row[6],
      createdAt: row[7],
      creatorName: row[8]
    }));

    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách dự án' });
  } finally {
    if (connection) await connection.close();
  }
});

// GET PROJECT BY ID
router.get('/:projectId', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { projectId } = req.params;
    connection = await database.getConnection();
    
    const result = await connection.execute(
      `SELECT p.ID, p.BUSINESS_ID, p.NAME, p.CODE, p.DESCRIPTION, 
              p.PROJECT_TEMPLATE_ID,
              p.CREATED_BY, TO_CHAR(p.CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') as CREATED_AT,
              u.USERNAME as CREATOR_NAME
       FROM INPLAN.PROJECTS p
       LEFT JOIN INPLAN.USERS u ON p.CREATED_BY = u.USER_ID
       WHERE p.ID = :projectId AND p.IS_DELETED = 0`,
      { projectId: parseInt(projectId) }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy dự án' });
    }

    const row = result.rows[0];
    const project = {
      id: row[0],
      businessId: row[1],
      name: row[2],
      code: row[3],
      description: row[4],
      projectTemplateId: row[5],
      createdBy: row[6],
      createdAt: row[7],
      creatorName: row[8]
    };

    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin dự án' });
  } finally {
    if (connection) await connection.close();
  }
});

// CREATE PROJECT
router.post('/', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { businessId, name, code, description, projectTemplateId } = req.body;
    connection = await database.getConnection();

    const result = await connection.execute(
      `INSERT INTO INPLAN.PROJECTS 
       (BUSINESS_ID, NAME, CODE, DESCRIPTION, PROJECT_TEMPLATE_ID, CREATED_BY, CREATED_AT)
       VALUES (:businessId, :name, :code, :description, :projectTemplateId, :userId, SYSTIMESTAMP)
       RETURNING ID INTO :id`,
      {
        businessId,
        name,
        code,
        description,
        projectTemplateId: projectTemplateId || null,
        userId: req.user.userId,
        id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
      },
      { autoCommit: true }
    );

    res.status(201).json({ 
      id: result.outBinds.id[0],
      message: 'Tạo dự án thành công' 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi tạo dự án' });
  } finally {
    if (connection) await connection.close();
  }
});

// UPDATE PROJECT
router.put('/:projectId', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { projectId } = req.params;
    const { name, code, description } = req.body;
    connection = await database.getConnection();
    
    await connection.execute(
      `UPDATE INPLAN.PROJECTS 
       SET NAME = :name, CODE = :code, DESCRIPTION = :description, UPDATED_AT = SYSTIMESTAMP
       WHERE ID = :projectId`,
      {
        name,
        code,
        description,
        projectId: parseInt(projectId)
      },
      { autoCommit: true }
    );

    res.json({ message: 'Cập nhật dự án thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi cập nhật dự án' });
  } finally {
    if (connection) await connection.close();
  }
});

// DELETE PROJECT
router.delete('/:projectId', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { projectId } = req.params;
    connection = await database.getConnection();
    
    await connection.execute(
      `UPDATE INPLAN.PROJECTS 
       SET IS_DELETED = 1, UPDATED_AT = SYSTIMESTAMP
       WHERE ID = :projectId`,
      {
        projectId: parseInt(projectId)
      },
      { autoCommit: true }
    );

    res.json({ message: 'Xóa dự án thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi xóa dự án' });
  } finally {
    if (connection) await connection.close();
  }
});

// ========================================
// TASK ROUTES
// ========================================

// GET TASKS BY PROJECT
router.get('/:projectId/tasks', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT t.ID, t.PROJECT_ID, t.NAME, t.DESCRIPTION, t.ASSIGNED_TO, t.SUPPORTER_ID,
              t.CHECKER_ID, t.STATUS, 
              TO_CHAR(t.START_TIME, 'YYYY-MM-DD HH24:MI:SS') as START_TIME, 
              TO_CHAR(t.END_TIME, 'YYYY-MM-DD HH24:MI:SS') as END_TIME, 
              t.DURATION, 
              TO_CHAR(t.DEADLINE, 'YYYY-MM-DD HH24:MI:SS') as DEADLINE, 
              TO_CHAR(t.CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') as CREATED_AT, 
              t.CREATED_BY,
              u1.USERNAME as ASSIGNED_NAME,
              u2.USERNAME as SUPPORTER_NAME,
              u3.USERNAME as CHECKER_NAME,
              u4.USERNAME as CREATOR_NAME
       FROM INPLAN.TASKS t
       LEFT JOIN INPLAN.USERS u1 ON t.ASSIGNED_TO = u1.USER_ID
       LEFT JOIN INPLAN.USERS u2 ON t.SUPPORTER_ID = u2.USER_ID
       LEFT JOIN INPLAN.USERS u3 ON t.CHECKER_ID = u3.USER_ID
       LEFT JOIN INPLAN.USERS u4 ON t.CREATED_BY = u4.USER_ID
       WHERE t.PROJECT_ID = :projectId AND t.IS_DELETED = 0
       ORDER BY t.CREATED_AT DESC`,
      [req.params.projectId]
    );

    const tasks = result.rows.map(row => ({
      id: row[0],
      projectId: row[1],
      name: row[2],
      description: row[3],
      assignedTo: row[4],
      supporterId: row[5],
      checkerId: row[6],
      status: row[7],
      startTime: row[8],
      endTime: row[9],
      duration: row[10],
      deadline: row[11],
      createdAt: row[12],
      createdBy: row[13],
      assignedName: row[14],
      supporterName: row[15],
      checkerName: row[16],
      creatorName: row[17]
    }));

    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách công việc' });
  } finally {
    if (connection) await connection.close();
  }
});

module.exports = router;