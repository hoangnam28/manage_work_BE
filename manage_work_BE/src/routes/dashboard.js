const express = require('express');
const router = express.Router();
const database = require('../config/database');
const oracledb = require('oracledb');
const { authenticateToken } = require('../middleware/auth');
require('dotenv').config();

oracledb.fetchAsBuffer = [oracledb.BLOB];
oracledb.autoCommit = true;

router.get('/stats', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    
    // Get business count
    const businessResult = await connection.execute(
      `SELECT COUNT(*) as TOTAL FROM INPLAN.BUSINESS_OPERATIONS WHERE IS_DELETED = 0`
    );
    
    // Get project count
    const projectResult = await connection.execute(
      `SELECT COUNT(*) as TOTAL FROM INPLAN.PROJECTS`
    );
    
    // Get task count
    const taskResult = await connection.execute(
      `SELECT COUNT(*) as TOTAL FROM INPLAN.TASKS WHERE IS_DELETED = 0`
    );
    
    // Get task status distribution
    const taskStatusResult = await connection.execute(
      `SELECT STATUS, COUNT(*) as COUNT 
       FROM INPLAN.TASKS 
       WHERE IS_DELETED = 0
       GROUP BY STATUS`
    );
    
    const statusDistribution = {};
    taskStatusResult.rows.forEach(row => {
      statusDistribution[row[0]] = row[1];
    });

    res.json({
      totalBusiness: businessResult.rows[0][0],
      totalProjects: projectResult.rows[0][0],
      totalTasks: taskResult.rows[0][0],
      taskStatusDistribution: statusDistribution
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy thống kê dashboard' });
  } finally {
    if (connection) await connection.close();
  }
});

// Get recent activity logs
router.get('/activity', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT * FROM (
         SELECT tl.ID, tl.TASK_ID, tl.USER_ID, tl.ACTION, tl.TIME_AT, tl.NOTE,
                t.NAME as TASK_NAME,
                u.USERNAME as USER_NAME,
                p.NAME as PROJECT_NAME,
                bo.NAME as BUSINESS_NAME,
                ROW_NUMBER() OVER (ORDER BY tl.TIME_AT DESC) as RN
         FROM INPLAN.TASK_LOGS tl
         LEFT JOIN INPLAN.TASKS t ON tl.TASK_ID = t.ID
         LEFT JOIN INPLAN.USERS u ON tl.USER_ID = u.USER_ID
         LEFT JOIN INPLAN.PROJECTS p ON t.PROJECT_ID = p.ID
         LEFT JOIN INPLAN.BUSINESS_OPERATIONS bo ON p.BUSINESS_ID = bo.ID
       )
       WHERE RN <= 20`
    );

    const activities = result.rows.map(row => ({
      id: row[0],
      taskId: row[1],
      userId: row[2],
      action: row[3],
      timeAt: row[4],
      note: row[5],
      taskName: row[6],
      userName: row[7],
      projectName: row[8],
      businessName: row[9]
    }));

    res.json(activities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy hoạt động gần đây' });
  } finally {
    if (connection) await connection.close();
  }
});

module.exports = router;