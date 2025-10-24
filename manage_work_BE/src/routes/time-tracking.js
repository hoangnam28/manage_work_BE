const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
oracledb.fetchAsString = [oracledb.CLOB];
oracledb.fetchAsString.push(oracledb.DATE);

async function getConnection() {
  try {
    return await database.getConnection();
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

// Get time tracking list for a certification
router.get('/certification/:certificationId', authenticateToken, async (req, res) => {
  const { certificationId } = req.params;
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

    // ✅ Convert timestamp to string để đảm bảo format đúng
    const query = `
      SELECT 
        tt.TIME_TRACKING_ID,
        tt.CERTIFICATION_ID,
        tt.PERSON_DO,
        tt.PERSON_CHECK,
        TO_CHAR(tt.START_TIME, 'YYYY-MM-DD HH24:MI:SS') as START_TIME,
        TO_CHAR(tt.END_TIME, 'YYYY-MM-DD HH24:MI:SS') as END_TIME,
        tt.TIME_DO,
        tt.TIME_CHECK,
        tt.TOTAL_TIME,
        tt.WORK_DESCRIPTION,
        tt.STATUS,
        TO_CHAR(tt.UPDATED_DATE, 'YYYY-MM-DD HH24:MI:SS') as UPDATED_DATE
      FROM TIME_TRACKING tt
      WHERE tt.CERTIFICATION_ID = :certificationId
      ORDER BY tt.START_TIME DESC
    `;

    const result = await connection.execute(query, [id], {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching time tracking:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy dữ liệu thời gian',
      error: error.message
    });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
});

// Create new time tracking record
router.post('/create', authenticateToken, async (req, res) => {
  const {
    certificationId,
    personDo,
    personCheck,
    startTime,
    endTime,
    timeDo,
    timeCheck,
    workDescription,
    status
  } = req.body;

  // Validate required fields
  if (!certificationId || !personDo || !startTime) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu thông tin bắt buộc: certificationId, personDo, startTime'
    });
  }

  let connection;

  try {
    connection = await getConnection();

    // Get next ID
    const idResult = await connection.execute(
      'SELECT NVL(MAX(TIME_TRACKING_ID), 0) + 1 as NEW_ID FROM TIME_TRACKING'
    );
    const newId = idResult.rows[0][0];

    // Calculate total time
    const totalTime = (timeDo || 0) + (timeCheck || 0);

    const insertSQL = `
      INSERT INTO TIME_TRACKING (
        TIME_TRACKING_ID, CERTIFICATION_ID, PERSON_DO, PERSON_CHECK,
        START_TIME, END_TIME, TIME_DO, TIME_CHECK, TOTAL_TIME,
        WORK_DESCRIPTION, STATUS
      ) VALUES (
        :id, :certificationId, :personDo, :personCheck,
        TO_TIMESTAMP(:startTime, 'YYYY-MM-DD HH24:MI:SS'),
        CASE 
          WHEN :endTime IS NOT NULL THEN TO_TIMESTAMP(:endTime, 'YYYY-MM-DD HH24:MI:SS')
          ELSE NULL 
        END,
        :timeDo, :timeCheck, :totalTime,
        :workDescription, :status
      )
    `;

    const params = {
      id: newId,
      certificationId,
      personDo: personDo,
      personCheck: personCheck || null,
      startTime: startTime,
      endTime: endTime || null,
      timeDo: timeDo || null,
      timeCheck: timeCheck || null,
      totalTime,
      workDescription: workDescription || null,
      status: status || 'PENDING'
    };

    await connection.execute(insertSQL, params);

    // Update certification total time
    await connection.execute(`
      UPDATE CERTIFICATION
      SET TOTAL_TIME = (
        SELECT NVL(SUM(TOTAL_TIME), 0)
        FROM TIME_TRACKING
        WHERE CERTIFICATION_ID = :certificationId
      )
      WHERE ID = :certificationId
    `, { certificationId });

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Tạo bản ghi thời gian thành công',
      data: { id: newId }
    });

  } catch (error) {
    console.error('Error creating time tracking:', error);
    if (connection) {
      await connection.rollback();
    }
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tạo bản ghi thời gian',
      error: error.message
    });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
});

// Update time tracking record
router.put('/update/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const {
    personDo,
    personCheck,
    startTime,
    endTime,
    timeDo,
    timeCheck,
    workDescription,
    status
  } = req.body;

  let connection;

  try {
    const timeId = parseInt(id);
    if (isNaN(timeId)) {
      return res.status(400).json({
        success: false,
        message: 'ID không hợp lệ'
      });
    }

    // ✅ DEBUG: Log request body để kiểm tra
    console.log('Update request body:', JSON.stringify(req.body, null, 2));

    connection = await getConnection();

    // Get certification ID first
    const certResult = await connection.execute(
      'SELECT CERTIFICATION_ID FROM TIME_TRACKING WHERE TIME_TRACKING_ID = :id',
      [timeId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (certResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bản ghi'
      });
    }

    const certificationId = certResult.rows[0].CERTIFICATION_ID;
    const totalTime = (Number(timeDo) || 0) + (Number(timeCheck) || 0);

    // ✅ Build SQL dynamically dựa trên các field có giá trị
    const updates = [];
    const params = { id: timeId };

    if (personDo !== undefined) {
      updates.push('PERSON_DO = :personDo');
      params.personDo = personDo;
    }

    if (personCheck !== undefined) {
      updates.push('PERSON_CHECK = :personCheck');
      params.personCheck = personCheck;
    }

    if (startTime) {
      updates.push("START_TIME = TO_TIMESTAMP(:startTime, 'YYYY-MM-DD HH24:MI:SS')");
      params.startTime = startTime;
    }

    if (endTime) {
      updates.push("END_TIME = TO_TIMESTAMP(:endTime, 'YYYY-MM-DD HH24:MI:SS')");
      params.endTime = endTime;
    } else if (endTime === null) {
      updates.push('END_TIME = NULL');
    }

    if (timeDo !== undefined) {
      updates.push('TIME_DO = :timeDo');
      params.timeDo = Number(timeDo) || 0;
    }

    if (timeCheck !== undefined) {
      updates.push('TIME_CHECK = :timeCheck');
      params.timeCheck = Number(timeCheck) || 0;
    }

    updates.push('TOTAL_TIME = :totalTime');
    params.totalTime = totalTime;

    if (workDescription !== undefined) {
      updates.push('WORK_DESCRIPTION = :workDescription');
      params.workDescription = workDescription;
    }

    if (status) {
      updates.push('STATUS = :status');
      params.status = status;
    }

    updates.push('UPDATED_DATE = SYSTIMESTAMP');

    const updateSQL = `
      UPDATE TIME_TRACKING 
      SET ${updates.join(', ')}
      WHERE TIME_TRACKING_ID = :id
    `;

    console.log('SQL:', updateSQL);
    console.log('Params:', params);

    await connection.execute(updateSQL, params);

    // Update certification total time
    await connection.execute(`
      UPDATE CERTIFICATION
      SET TOTAL_TIME = (
        SELECT NVL(SUM(TOTAL_TIME), 0)
        FROM TIME_TRACKING
        WHERE CERTIFICATION_ID = :certificationId
      )
      WHERE ID = :certificationId
    `, { certificationId });

    await connection.commit();

    res.json({
      success: true,
      message: 'Cập nhật thành công'
    });

  } catch (error) {
    console.error('Error updating time tracking:', error);
    console.error('Request body was:', req.body);
    if (connection) {
      await connection.rollback();
    }
    res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật',
      error: error.message
    });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
});
// Delete time tracking record
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  let connection;

  try {
    const timeId = parseInt(id);
    if (isNaN(timeId)) {
      return res.status(400).json({
        success: false,
        message: 'ID không hợp lệ'
      });
    }

    connection = await getConnection();

    // Get certification ID first
    const certResult = await connection.execute(
      'SELECT CERTIFICATION_ID FROM TIME_TRACKING WHERE TIME_TRACKING_ID = :id',
      [timeId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (certResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bản ghi'
      });
    }

    const certificationId = certResult.rows[0].CERTIFICATION_ID;

    // Delete record
    await connection.execute(
      'DELETE FROM TIME_TRACKING WHERE TIME_TRACKING_ID = :id',
      [timeId]
    );

    // Update certification total time
    await connection.execute(`
      UPDATE CERTIFICATION
      SET TOTAL_TIME = (
        SELECT NVL(SUM(TOTAL_TIME), 0)
        FROM TIME_TRACKING
        WHERE CERTIFICATION_ID = :certificationId
      )
      WHERE ID = :certificationId
    `, { certificationId });

    await connection.commit();

    res.json({
      success: true,
      message: 'Xóa thành công'
    });

  } catch (error) {
    console.error('Error deleting time tracking:', error);
    if (connection) {
      await connection.rollback();
    }
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa',
      error: error.message
    });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
});

// Get summary statistics
router.get('/summary/:certificationId', authenticateToken, async (req, res) => {
  const { certificationId } = req.params;
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

    const query = `
      SELECT 
        COUNT(*) as TOTAL_RECORDS,
        NVL(SUM(TIME_DO), 0) as TOTAL_TIME_DO,
        NVL(SUM(TIME_CHECK), 0) as TOTAL_TIME_CHECK,
        NVL(SUM(TOTAL_TIME), 0) as TOTAL_TIME,
        NVL(AVG(TIME_DO), 0) as AVG_TIME_DO,
        NVL(AVG(TIME_CHECK), 0) as AVG_TIME_CHECK
      FROM TIME_TRACKING  
      WHERE CERTIFICATION_ID = :certificationId
    `;

    const result = await connection.execute(query, [id], {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thống kê',
      error: error.message
    });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
});
router.get('/latest-description/:certificationId', authenticateToken, async (req, res) => {
  const { certificationId } = req.params;
  let connection;

  try {
    const id = parseInt(certificationId);
    connection = await getConnection();

    const query = `
      SELECT WORK_DESCRIPTION
      FROM TIME_TRACKING
      WHERE CERTIFICATION_ID = :certificationId
      ORDER BY UPDATED_DATE DESC
      FETCH FIRST 1 ROW ONLY
    `;

    const result = await connection.execute(query, [id], {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });

    res.json({
      success: true,
      data: result.rows[0]?.WORK_DESCRIPTION || ''
    });

  } catch (error) {
    console.error('Error fetching latest description:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy mô tả',
      error: error.message
    });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
});
module.exports = router;