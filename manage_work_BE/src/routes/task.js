const express = require('express');
const router = express.Router();
const database = require('../config/database');
const oracledb = require('oracledb');
const { authenticateToken } = require('../middleware/auth');

oracledb.fetchAsBuffer = [oracledb.BLOB];
oracledb.autoCommit = true;

// Helper function để log task activity
const logTaskActivity = async (connection, taskId, userId, action, note = null, startTime = null, endTime = null) => {
  try {
    let logQuery = `
      INSERT INTO TASK_LOGS (TASK_ID, USER_ID, ACTION, TIME_AT, NOTE
    `;

    if (startTime !== null) logQuery += `, START_TIME`;
    if (endTime !== null) logQuery += `, END_TIME`;

    logQuery += `) VALUES (:taskId, :userId, :action, SYSTIMESTAMP, :note`;
    if (startTime !== null) logQuery += `, :startTime`;
    if (endTime !== null) logQuery += `, :endTime`;
    logQuery += `)`;

    const bindVars = {
      taskId,
      userId,
      action,
      note: note || null,
    };

        if (startTime) {
      const startVal = typeof startTime === 'string'
        ? new Date(startTime.replace(' ', 'T'))
        : new Date(startTime);
      bindVars.startTime = startVal;
    }

    if (endTime) {
      const endVal = typeof endTime === 'string'
        ? new Date(endTime.replace(' ', 'T'))
        : new Date(endTime);
      bindVars.endTime = endVal;
    }


    await connection.execute(logQuery, bindVars, { autoCommit: true });
  } catch (error) {
    console.error('Error logging task activity:', error);
  }
};

// Helper function để validate task data
const validateTaskData = (data) => {
  const requiredFields = ['name', 'description', 'assigned_to', 'deadline'];
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
};

// Hàm helper để format response
const formatResponse = (result) => {
  if (!result.rows) return null;
  return result.rows.map(row => {
    let task = {};
    result.metaData.forEach((column, index) => {
      task[column.name.toLowerCase()] = row[index];
    });
    return task;
  });
};

// GET /bussiness/my-tasks - Lấy danh sách tasks được giao cho user hiện tại
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

router.post('/', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { project_id, name, description, assigned_to, supporter_id, checker_id, deadline } = req.body;
    connection = await database.getConnection();

    const result = await connection.execute(  
  `INSERT INTO TASKS 
   (PROJECT_ID, NAME, DESCRIPTION, ASSIGNED_TO, SUPPORTER_ID, CHECKER_ID, 
    STATUS, DEADLINE, CREATED_BY, CREATED_AT)
   VALUES (:project_id, :name, :description, :assigned_to, :supporter_id, :checker_id,
           'pending', TO_TIMESTAMP(:deadline, 'YYYY-MM-DD HH24:MI:SS.FF3')
, :userId, SYSTIMESTAMP)
   RETURNING ID INTO :id`,
  {
    project_id,
    name,
    description,
    assigned_to,
    supporter_id,
    checker_id,
    deadline,
    userId: req.user.userId,
    id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
  },
  { autoCommit: true }
);


    res.status(201).json({ 
      id: result.outBinds.id[0],
      message: 'Tạo công việc thành công' 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi tạo công việc' });
  } finally {
    if (connection) await connection.close();
  }
});

router.get('/check-tasks', authenticateToken, async (req, res) => {
  let connection;
  try {
    const userId = req.user.user_id;
    connection = await database.getConnection();
    
    const query = `
      SELECT 
        t.*,
        p.name as project_name,
        b.name as business_name,
        u1.fullname as created_by_name,
        u2.fullname as assigned_to_name,
        CASE 
          WHEN t.end_time IS NOT NULL THEN 
            ROUND((t.end_time - t.start_time) * 24 * 60, 2)
          ELSE NULL 
        END as duration
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.project_id 
      LEFT JOIN business b ON t.business_id = b.business_id
      LEFT JOIN users u1 ON t.created_by = u1.user_id
      LEFT JOIN users u2 ON t.assigned_to = u2.user_id
      WHERE t.status = 'done' 
      AND t.checker_id = :userId 
      AND t.deleted_at IS NULL
      ORDER BY t.end_time DESC
    `;
    
    const result = await connection.execute(
      query, 
      { userId }, 
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching check tasks:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách tasks cần kiểm tra' });
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

// GET /bussiness/tasks/:id - Lấy chi tiết task
router.get('/tasks/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    
    const query = `
      SELECT 
        t.*,
        p.name as project_name,
        b.name as business_name,
        u1.fullname as created_by_name,
        u2.fullname as assigned_to_name,
        u3.fullname as checker_name,
        CASE 
          WHEN t.end_time IS NOT NULL THEN 
            ROUND((t.end_time - t.start_time) * 24 * 60, 2)
          ELSE NULL 
        END as duration
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.project_id 
      LEFT JOIN business b ON t.business_id = b.business_id
      LEFT JOIN users u1 ON t.created_by = u1.user_id
      LEFT JOIN users u2 ON t.assigned_to = u2.user_id
      LEFT JOIN users u3 ON t.checker_id = u3.user_id
      WHERE t.task_id = :taskId AND t.deleted_at IS NULL
    `;
    
    const result = await connection.execute(
      query,
      { taskId: req.params.id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy task' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching task details:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết task' });
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

// POST /bussiness/tasks/:id/start - Bắt đầu thực hiện task
router.post('/:id/start', authenticateToken, async (req, res) => {
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
   
       
    // Ghi log
    await logTaskActivity(
      connection,
      task.ID,
      req.user.userId,
      'start',
      `Bắt đầu thực hiện task: ${task.NAME}`,
      result.outBinds.r_start_time[0],
      null
    );

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

// POST /bussiness/tasks/:id/complete - Hoàn thành task
router.post('/:id/complete', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const taskId = req.params.id;
    const userId = req.user.userId;

    // Kiểm tra task
    const checkQuery = `
      SELECT * FROM tasks 
      WHERE id = :taskId 
      AND assigned_to = :userId
      AND is_deleted = 0
    `;
    const checkResult = await connection.execute(
      checkQuery, 
      { taskId, userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task không tồn tại hoặc không được giao cho bạn' });
    }

    const task = checkResult.rows[0];

    if (task.STATUS === 'done' || task.STATUS === 'checked') {
      return res.status(400).json({ message: 'Task đã hoàn thành' });
    }

    if (task.STATUS !== 'in_progress') {
      return res.status(400).json({ message: 'Task chưa được bắt đầu' });
    }

    // Cập nhật trạng thái và thời gian kết thúc
    const endTime = new Date();
    const updateQuery = `
      UPDATE tasks 
      SET 
        status = 'done',
        end_time = :endTime,
        updated_at = SYSTIMESTAMP,
        updated_by = :userId
      WHERE id = :taskId
      RETURNING id, status, end_time 
      INTO :r_id, :r_status, :r_end_time
    `;

    const bindVars = {
      userId,
      taskId,
      endTime: { val: endTime, type: oracledb.DATE },
      r_id: { dir: oracledb.BIND_OUT },
      r_status: { dir: oracledb.BIND_OUT },
      r_end_time: { dir: oracledb.BIND_OUT, type: oracledb.DATE }
    };

    const result = await connection.execute(updateQuery, bindVars, { autoCommit: true });

    await logTaskActivity(
      connection,
      taskId,
      userId,
      'complete',
      `Hoàn thành task: ${task.NAME}`,
      endTime
    );
    res.json({ 
      message: 'Hoàn thành task thành công',
      id: result.outBinds.r_id,
      status: result.outBinds.r_status,
      end_time: result.outBinds.r_end_time,
      duration: task.START_TIME ? Math.round((endTime - task.START_TIME) / 1000 / 60) : null
    });
  } catch (error) {
    console.error('Error completing task:', error);
    res.status(500).json({ message: 'Lỗi khi hoàn thành task' });
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

// PUT /bussiness/tasks/:id - Cập nhật thông tin task
router.put('/tasks/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    const taskId = req.params.id;
    const updateData = req.body;

    // Validate dữ liệu
    validateTaskData(updateData);

    connection = await database.getConnection();

    // Kiểm tra task có tồn tại không và lấy thông tin cũ
    const checkQuery = `
      SELECT * FROM tasks 
      WHERE task_id = :taskId 
      AND deleted_at IS NULL
    `;
    const checkResult = await connection.execute(
      checkQuery,
      { taskId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task không tồn tại' });
    }

    const oldTask = checkResult.rows[0];

    // Cập nhật task
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
      WHERE task_id = :taskId
      RETURNING 
        task_id,
        name,
        description,
        status,
        assigned_to,
        supporter_id,
        checker_id,
        deadline,
        created_at,
        updated_at
      INTO :r_task_id, :r_name, :r_description, :r_status, :r_assigned_to,
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
      taskId: taskId,
      // OUT params
      r_task_id: { dir: oracledb.BIND_OUT },
      r_name: { dir: oracledb.BIND_OUT },
      r_description: { dir: oracledb.BIND_OUT },
      r_status: { dir: oracledb.BIND_OUT },
      r_assigned_to: { dir: oracledb.BIND_OUT },
      r_supporter_id: { dir: oracledb.BIND_OUT },
      r_checker_id: { dir: oracledb.BIND_OUT },
      r_deadline: { dir: oracledb.BIND_OUT, type: oracledb.DATE },
      r_created_at: { dir: oracledb.BIND_OUT, type: oracledb.DATE },
      r_updated_at: { dir: oracledb.BIND_OUT, type: oracledb.DATE }
    };

    const result = await connection.execute(updateQuery, bindParams, { autoCommit: true });

    // Ghi log các thay đổi
    const changes = [];
    if (oldTask.NAME !== updateData.name) {
      changes.push(`Đổi tên từ "${oldTask.NAME}" sang "${updateData.name}"`);
    }
    if (oldTask.ASSIGNED_TO !== updateData.assigned_to) {
      changes.push(`Thay đổi người thực hiện`);
      await logTaskActivity(
        connection,
        taskId,
        req.user.user_id,
        'REASSIGNED',
        `Gán lại task cho user ${updateData.assigned_to}`,
        null,
        null
      );
    }
    if (oldTask.CHECKER_ID !== updateData.checker_id) {
      changes.push(`Thay đổi người kiểm tra`);
    }
    if (oldTask.SUPPORTER_ID !== updateData.supporter_id) {
      changes.push(`Thay đổi người hỗ trợ`);
    }

    if (changes.length > 0) {
      await logTaskActivity(
        connection,
        taskId,
        req.user.user_id,
        'UPDATED',
        changes.join(', '),
        null,
        null
      );
    }

    // Format kết quả trả về
    const updatedTask = {
      task_id: result.outBinds.r_task_id,
      name: result.outBinds.r_name,
      description: result.outBinds.r_description,
      status: result.outBinds.r_status,
      assigned_to: result.outBinds.r_assigned_to,
      supporter_id: result.outBinds.r_supporter_id,
      checker_id: result.outBinds.r_checker_id,
      deadline: result.outBinds.r_deadline,
      created_at: result.outBinds.r_created_at,
      updated_at: result.outBinds.r_updated_at
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

// DELETE /bussiness/tasks/:id - Xóa mềm task
router.delete('/tasks/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();

    // Kiểm tra task có tồn tại và chưa bị xóa
    const checkQuery = `
      SELECT * FROM tasks 
      WHERE task_id = :taskId AND deleted_at IS NULL
    `;
    const checkResult = await connection.execute(
      checkQuery,
      { taskId: req.params.id },
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
        AND role = 'admin'
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
      WHERE task_id = :taskId
      RETURNING task_id, deleted_at INTO :r_task_id, :r_deleted_at
    `;
    
    const bindVars = {
      userId: req.user.user_id,
      taskId: req.params.id,
      r_task_id: { dir: oracledb.BIND_OUT },
      r_deleted_at: { dir: oracledb.BIND_OUT, type: oracledb.DATE }
    };

    const result = await connection.execute(deleteQuery, bindVars, { autoCommit: true });

    // Ghi log xóa task
    await logTaskActivity(
      connection,
      req.params.id,
      req.user.user_id,
      'DELETED',
      `Xóa task: ${task.NAME}`,
      null,
      null
    );

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

module.exports = router;