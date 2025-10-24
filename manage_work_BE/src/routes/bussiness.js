const express = require('express');
const router = express.Router();
const database = require('../config/database');
const oracledb = require('oracledb');
const { authenticateToken } = require('../middleware/auth');
require('dotenv').config();

oracledb.fetchAsBuffer = [oracledb.BLOB];
oracledb.autoCommit = true;

const validateTaskData = (data) => {
  const requiredFields = ['name', 'description', 'assigned_to', 'deadline'];
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
};

// GET all businesses
router.get('/', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT bo.ID, bo.NAME, bo.DESCRIPTION, bo.CREATED_BY, 
              TO_CHAR(bo.CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') as CREATED_AT, 
              u.USERNAME as CREATOR_NAME
       FROM INPLAN.BUSINESS_OPERATIONS bo
       LEFT JOIN INPLAN.USERS u ON bo.CREATED_BY = u.USER_ID
       WHERE bo.IS_DELETED = 0
       ORDER BY bo.CREATED_AT DESC`
    );

    const businesses = result.rows.map(row => ({
      id: row[0],
      name: row[1],
      description: row[2],
      createdBy: row[3],
      createdAt: row[4], 
      creatorName: row[5]
    }));

    res.json(businesses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách nghiệp vụ' });
  } finally {
    if (connection) await connection.close();
  }
});
router.post('/', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { name, description } = req.body;
    connection = await database.getConnection();
    const result = await connection.execute(
      `INSERT INTO INPLAN.BUSINESS_OPERATIONS (NAME, DESCRIPTION, CREATED_BY, CREATED_AT)
       VALUES (:name, :description, :userId, SYSTIMESTAMP)
       RETURNING ID INTO :id`,
      {
        name,
        description,
        userId: req.user.userId,
        id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
      },
      { autoCommit: true }
    );

    res.status(201).json({ 
      id: result.outBinds.id[0],
      message: 'Tạo nghiệp vụ thành công' 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi tạo nghiệp vụ' });
  } finally {
    if (connection) await connection.close();
  }
});


// GET my tasks
router.get('/my-tasks', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT t.ID, t.PROJECT_ID, t.NAME, t.DESCRIPTION, t.STATUS, 
              TO_CHAR(t.START_TIME, 'YYYY-MM-DD HH24:MI:SS') as START_TIME, 
              TO_CHAR(t.END_TIME, 'YYYY-MM-DD HH24:MI:SS') as END_TIME, 
              t.DURATION, 
              TO_CHAR(t.DEADLINE, 'YYYY-MM-DD HH24:MI:SS') as DEADLINE,
              p.NAME as PROJECT_NAME, p.CODE as PROJECT_CODE,
              bo.NAME as BUSINESS_NAME
       FROM INPLAN.TASKS t
       JOIN INPLAN.PROJECTS p ON t.PROJECT_ID = p.ID
       JOIN INPLAN.BUSINESS_OPERATIONS bo ON p.BUSINESS_ID = bo.ID
       WHERE (t.ASSIGNED_TO = :userId OR t.SUPPORTER_ID = :userId) AND t.IS_DELETED = 0
       ORDER BY t.DEADLINE ASC, t.CREATED_AT DESC`,
      { userId: req.user.userId }
    );

    const tasks = result.rows.map(row => ({
      id: row[0],
      projectId: row[1],
      name: row[2],
      description: row[3],
      status: row[4],
      startTime: row[5],
      endTime: row[6],
      duration: row[7],
      deadline: row[8],
      projectName: row[9],
      projectCode: row[10],
      businessName: row[11]
    }));

    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy công việc của tôi' });
  } finally {
    if (connection) await connection.close();
  }
});

// GET check tasks
router.get('/check-tasks', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT t.ID, t.PROJECT_ID, t.NAME, t.DESCRIPTION, t.STATUS, 
              TO_CHAR(t.START_TIME, 'YYYY-MM-DD HH24:MI:SS') as START_TIME, 
              TO_CHAR(t.END_TIME, 'YYYY-MM-DD HH24:MI:SS') as END_TIME, 
              t.DURATION, 
              TO_CHAR(t.DEADLINE, 'YYYY-MM-DD HH24:MI:SS') as DEADLINE,
              t.ASSIGNED_TO, u1.USERNAME as ASSIGNED_NAME,
              p.NAME as PROJECT_NAME, p.CODE as PROJECT_CODE,
              bo.NAME as BUSINESS_NAME
       FROM INPLAN.TASKS t
       JOIN INPLAN.PROJECTS p ON t.PROJECT_ID = p.ID
       JOIN INPLAN.BUSINESS_OPERATIONS bo ON p.BUSINESS_ID = bo.ID
       LEFT JOIN INPLAN.USERS u1 ON t.ASSIGNED_TO = u1.USER_ID
       WHERE t.CHECKER_ID = :userId
       ORDER BY t.STATUS, t.DEADLINE ASC`,
      { userId: req.user.userId }
    );

    const tasks = result.rows.map(row => ({
      id: row[0],
      projectId: row[1],
      name: row[2],
      description: row[3],
      status: row[4],
      startTime: row[5],
      endTime: row[6],
      duration: row[7],
      deadline: row[8],
      assignedTo: row[9],
      assignedName: row[10],
      projectName: row[11],
      projectCode: row[12],
      businessName: row[13]
    }));

    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy công việc cần kiểm tra' });
  } finally {
    if (connection) await connection.close();
  }
});

router.put('/tasks/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    const id = req.params.id; // ID từ URL params
    const updateData = req.body;

    // Validate dữ liệu
    validateTaskData(updateData);

    connection = await database.getConnection();

    // Kiểm tra task có tồn tại không
    const checkQuery = `
      SELECT * FROM tasks 
      WHERE id = :id 
      AND is_deleted = 0
    `;
    const checkResult = await connection.execute(
      checkQuery,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task không tồn tại' });
    }

    const updateQuery = `
      UPDATE tasks 
      SET 
        name = :name,
        description = :description,
        assigned_to = :assigned_to,
        supporter_id = :supporter_id,
        checker_id = :checker_id,
        deadline = TO_TIMESTAMP(:deadline, 'YYYY-MM-DD HH24:MI:SS'),
        updated_at = SYSTIMESTAMP,
        updated_by = :updated_by
      WHERE id = :id
      RETURNING 
        id,
        name,
        description,
        status,
        assigned_to,
        supporter_id,
        checker_id,
        deadline,
        created_at,
        updated_at
      INTO :r_id, :r_name, :r_description, :r_status, :r_assigned_to,
           :r_supporter_id, :r_checker_id, :r_deadline, :r_created_at, :r_updated_at
    `;

    const bindParams = {
      name: updateData.name,
      description: updateData.description,
      assigned_to: updateData.assigned_to,
      supporter_id: updateData.supporter_id || null,
      checker_id: updateData.checker_id || null,
      deadline: updateData.deadline,
      updated_by: req.user.user_id,
      id: id, // ✅ Sửa: dùng id từ req.params, không phải updateData.id
      // OUT params
      r_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      r_name: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
      r_description: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
      r_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
      r_assigned_to: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      r_supporter_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      r_checker_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      r_deadline: { dir: oracledb.BIND_OUT, type: oracledb.DATE },
      r_created_at: { dir: oracledb.BIND_OUT, type: oracledb.DATE },
      r_updated_at: { dir: oracledb.BIND_OUT, type: oracledb.DATE }
    };

    const result = await connection.execute(updateQuery, bindParams, { autoCommit: true });

    // Format kết quả trả về
    const updatedTask = {
      id: result.outBinds.r_id[0], 
      name: result.outBinds.r_name[0],
      description: result.outBinds.r_description[0],
      status: result.outBinds.r_status[0],
      assigned_to: result.outBinds.r_assigned_to[0],
      supporter_id: result.outBinds.r_supporter_id[0],
      checker_id: result.outBinds.r_checker_id[0],
      deadline: result.outBinds.r_deadline[0],
      created_at: result.outBinds.r_created_at[0],
      updated_at: result.outBinds.r_updated_at[0]
    };

    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(400).json({ 
      message: error.message || 'Lỗi khi cập nhật task'
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

router.post('/tasks/:id/start', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();

    // Kiểm tra task có tồn tại và chưa bị xóa
    const checkQuery = `
      SELECT * FROM tasks 
      WHERE id = :id AND is_deleted = 0
    `
    ;
    const checkResult = await connection.execute(
      checkQuery, 
      { id: req.params.id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task không tồn tại' });
    }

    const task = checkResult.rows[0];
    
    // Kiểm tra quyền thực hiện
    if (task.ASSIGNED_TO !== req.user.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện task này' });
    }

    // Kiểm tra trạng thái
    if (task.STATUS !== 'pending') {
      return res.status(400).json({ message: 'Task không ở trạng thái chờ thực hiện' });
    }

    // Cập nhật trạng thái và thời gian bắt đầu
    const updateQuery = `
      UPDATE tasks 
      SET status = 'in_progress', 
          start_time = SYSTIMESTAMP,
          updated_at = SYSTIMESTAMP,
          updated_by = :userId
      WHERE id = :id
      RETURNING id, status, start_time 
      INTO :r_id, :r_status, :r_start_time
    `;
    
    const bindVars = {
      userId: req.user.userId,
      id: req.params.id,
      r_id: { dir: oracledb.BIND_OUT },
      r_status: { dir: oracledb.BIND_OUT },
      r_start_time: { dir: oracledb.BIND_OUT, type: oracledb.DATE }
    };

    const result = await connection.execute(updateQuery, bindVars, { autoCommit: true });

    res.json({
      id: result.outBinds.r_id,
      status: result.outBinds.r_status,
      start_time: result.outBinds.r_start_time
    });
  } catch (error) {
    console.error('Error starting task:', error);
    res.status(400).json({ message: error.message });
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

router.put('/tasks/:taskId', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { taskId } = req.params;
    const { name, description, assignedTo, supporterId, checkerId, deadline } = req.body;
    connection = await database.getConnection();
    
    await connection.execute(
      `UPDATE INPLAN.TASKS 
       SET NAME = :name, DESCRIPTION = :description, ASSIGNED_TO = :assignedTo,
           SUPPORTER_ID = :supporterId, CHECKER_ID = :checkerId, DEADLINE = :deadline,
           UPDATED_AT = SYSTIMESTAMP
       WHERE ID = :taskId`,
      {
        name,
        description,
        assignedTo,
        supporterId,
        checkerId,
        deadline,
        taskId: parseInt(taskId)
      },
      { autoCommit: true }
    );

    res.json({ message: 'Cập nhật công việc thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi cập nhật công việc' });
  } finally {
    if (connection) await connection.close();
  }
});


router.delete('/tasks/:taskId', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { taskId } = req.params;
    connection = await database.getConnection();
    
    await connection.execute(
      `UPDATE INPLAN.TASKS 
       SET IS_DELETED = 1, UPDATED_AT = SYSTIMESTAMP
       WHERE ID = :taskId`,
      {
        taskId: parseInt(taskId)
      },
      { autoCommit: true }
    );

    res.json({ message: 'Xóa công việc thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi xóa công việc' });
  } finally {
    if (connection) await connection.close();
  }
});

// POST /bussiness/tasks/:id/end - Kết thúc task
router.post('/tasks/:id/end', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();

    // Kiểm tra task có tồn tại và chưa bị xóa
    const checkQuery = `
      SELECT * FROM tasks 
      WHERE id = :id AND is_deleted = 0
    `;
    const checkResult = await connection.execute(
      checkQuery, 
      { id: req.params.id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task không tồn tại' });
    }

    const task = checkResult.rows[0];
    
    // Kiểm tra quyền thực hiện
    if (task.ASSIGNED_TO !== req.user.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện task này' });
    }

    // Kiểm tra trạng thái
    if (task.STATUS !== 'in_progress') {
      return res.status(400).json({ message: 'Task không ở trạng thái đang thực hiện' });
    }

    // Cập nhật trạng thái, thời gian kết thúc và ghi chú
    const updateQuery = `
      UPDATE tasks 
      SET status = 'done',
          end_time = SYSTIMESTAMP,
          updated_at = SYSTIMESTAMP,
          updated_by = :userId
      WHERE id = :id
      RETURNING 
        id,
        status,
        end_time
      INTO :r_id, :r_status, :r_end_time
    `;
    
    const bindVars = {
      userId: req.user.userId,
      id: req.params.id,
      r_id: { dir: oracledb.BIND_OUT },
      r_status: { dir: oracledb.BIND_OUT },
      r_end_time: { dir: oracledb.BIND_OUT, type: oracledb.DATE },
    };

    const result = await connection.execute(updateQuery, bindVars, { autoCommit: true });

    res.json({
      id: result.outBinds.r_id,
      status: result.outBinds.r_status,
      end_time: result.outBinds.r_end_time,
    });
  } catch (error) {
    console.error('Error ending task:', error);
    res.status(400).json({ message: error.message });
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

router.delete('/tasks/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();

    // Kiểm tra task có tồn tại và chưa bị xóa
    const checkQuery = `
      SELECT * FROM tasks 
      WHERE id = :id AND is_deleted = 0
    `;
    const checkResult = await connection.execute(
      checkQuery,
      { id: req.params.id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task không tồn tại hoặc đã bị xóa' });
    }

    const task = checkResult.rows[0];
    
    // Chỉ cho phép người tạo hoặc quản lý dự án xóa task
    if (task.CREATED_BY !== req.user.user_id) {
      // Kiểm tra xem user có phải là quản lý dự án không
      const isProjectManagerQuery = `
        SELECT 1 FROM project_members 
        WHERE project_id = :projectId 
        AND user_id = :userId 
        AND role = 'MANAGER'
      `;
      const managerCheck = await connection.execute(
        isProjectManagerQuery,
        { projectId: task.PROJECT_ID, userId: req.user.user_id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (managerCheck.rows.length === 0) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa task này' });
      }
    }

    // Thực hiện xóa mềm
    const deleteQuery = `
      UPDATE tasks 
      SET 
        deleted_at = SYSTIMESTAMP,
        deleted_by = :userId
      WHERE task_id = :id
      RETURNING task_id, deleted_at INTO :r_task_id, :r_deleted_at
    `;
    
    const bindVars = {
      userId: req.user.user_id,
      id: req.params.id,
      r_task_id: { dir: oracledb.BIND_OUT },
      r_deleted_at: { dir: oracledb.BIND_OUT, type: oracledb.DATE }
    };

    const result = await connection.execute(deleteQuery, bindVars, { autoCommit: true });

    res.json({ 
      message: 'Xóa task thành công', 
      task: {
        task_id: result.outBinds.r_task_id,
        deleted_at: result.outBinds.r_deleted_at
      }
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(400).json({ message: error.message });
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

// PUT /bussiness/projects/:id - Cập nhật project
router.put('/projects/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    
    // Kiểm tra project tồn tại
    const checkQuery = `
      SELECT * FROM INPLAN.PROJECTS 
      WHERE ID = :id AND IS_DELETED = 0
    `;
    
    const checkResult = await connection.execute(
      checkQuery,
      { id: req.params.id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Project không tồn tại hoặc đã bị xóa' });
    }

    const { name, code, description } = req.body;

    // Cập nhật project
    const updateQuery = `
      UPDATE INPLAN.PROJECTS 
      SET 
        NAME = :name,
        CODE = :code,
        DESCRIPTION = :description,
        UPDATED_AT = SYSTIMESTAMP,
        UPDATED_BY = :userId
      WHERE ID = :id
      RETURNING 
        ID, BUSINESS_ID, NAME, CODE, DESCRIPTION, 
        CREATED_BY, CREATED_AT, UPDATED_AT
      INTO :r_id, :r_business_id, :r_name, :r_code, :r_description,
           :r_created_by, :r_created_at, :r_updated_at
    `;

    const bindParams = {
      name,
      code,
      description,
      userId: req.user.userId,
      id: req.params.id,
      r_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      r_business_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      r_name: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
      r_code: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
      r_description: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
      r_created_by: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      r_created_at: { dir: oracledb.BIND_OUT, type: oracledb.DATE },
      r_updated_at: { dir: oracledb.BIND_OUT, type: oracledb.DATE }
    };

    const result = await connection.execute(updateQuery, bindParams, { autoCommit: true });

    res.json({
      id: result.outBinds.r_id[0],
      businessId: result.outBinds.r_business_id[0],
      name: result.outBinds.r_name[0],
      code: result.outBinds.r_code[0],
      description: result.outBinds.r_description[0],
      createdBy: result.outBinds.r_created_by[0],
      createdAt: result.outBinds.r_created_at[0],
      updatedAt: result.outBinds.r_updated_at[0]
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(400).json({ message: error.message || 'Lỗi khi cập nhật project' });
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

// DELETE /bussiness/projects/:id - Xóa project (soft delete)
router.delete('/projects/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    
    // Kiểm tra project tồn tại
    const checkQuery = `
      SELECT * FROM INPLAN.PROJECTS 
      WHERE ID = :id AND IS_DELETED = 0
    `;
    
    const checkResult = await connection.execute(
      checkQuery,
      { id: req.params.id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Project không tồn tại hoặc đã bị xóa' });
    }

    // Kiểm tra quyền xóa (chỉ người tạo hoặc admin có quyền xóa)
    const project = checkResult.rows[0];
    if (project.CREATED_BY !== req.user.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa project này' });
    }

    // Thực hiện xóa mềm
    const deleteQuery = `
      UPDATE INPLAN.PROJECTS 
      SET 
        IS_DELETED = 1,
        DELETED_AT = SYSTIMESTAMP,
        DELETED_BY = :userId
      WHERE ID = :id
      RETURNING ID, DELETED_AT INTO :r_id, :r_deleted_at
    `;

    const bindParams = {
      userId: req.user.userId,
      id: req.params.id,
      r_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      r_deleted_at: { dir: oracledb.BIND_OUT, type: oracledb.DATE }
    };

    const result = await connection.execute(deleteQuery, bindParams, { autoCommit: true });

    res.json({
      message: 'Xóa project thành công',
      project: {
        id: result.outBinds.r_id[0],
        deletedAt: result.outBinds.r_deleted_at[0]
      }
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(400).json({ message: error.message || 'Lỗi khi xóa project' });
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