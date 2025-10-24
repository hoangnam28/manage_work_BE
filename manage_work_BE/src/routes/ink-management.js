const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sendMail } = require('../helper/sendMailInk'); // Import email utility

// Danh sách email người nhận thông báo
const AllEmails = [
  'nam.nguyenhoang@meiko-elec.com'
];

async function getConnection() {
  try {
    return await database.getConnection();
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

// Create new ink request
router.post('/create', authenticateToken, async (req, res) => {
  const { color, method, vendor, type, color_name } = req.body;
  const createdBy = req.user.username;
  let connection;

  try {
    connection = await getConnection();

    // Get next ID
    const result = await connection.execute(
      'SELECT NVL(MAX(ID), 0) + 1 as NEW_ID FROM INK_MANAGEMENT'
    );
    const newId = result.rows[0][0];

    // Insert new request
    await connection.execute(
      `INSERT INTO INK_MANAGEMENT (
        ID, TYPE, COLOR, METHOD, VENDOR, COLOR_NAME,
        CREATED_BY, STATUS, CREATED_AT
      ) VALUES (
        :id, :type, :color, :method, :vendor, :color_name,
        :createdBy, 'PENDING', SYSTIMESTAMP
      )`,
      {
        id: newId,
        color: color,
        method: method,
        vendor: vendor,
        createdBy: createdBy,
        type: type,
        color_name: color_name
      }
    );

    await connection.commit();

    // Lấy email của người tạo
    let creatorEmail = null;
    if (req.user && req.user.userId) {
      try {
        const userResult = await connection.execute(
          `SELECT email FROM users WHERE user_id = :userId AND (is_deleted = 0 OR is_deleted IS NULL)`,
          { userId: req.user.userId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (userResult.rows.length > 0) {
          creatorEmail = userResult.rows[0].EMAIL;
        }
      } catch (userError) {
        console.error('Error fetching user email:', userError);
      }
    }

    // Tạo danh sách email (loại bỏ duplicate nếu có)
    const emailRecipients = [...AllEmails];
    if (creatorEmail && !emailRecipients.includes(creatorEmail)) {
      emailRecipients.push(creatorEmail);
    }

    // Get email subject based on ink type
    let emailSubject = '🎨 YÊU CẦU THÊM MÀU MỰC MỚI';
    switch (type) {
      case 'SOLDERMASK_INK':
        emailSubject = '🎨 YÊU CẦU THÊM SOLDERMASK_INK';
        break;
      case 'SILKSCREEN_INK':
        emailSubject = '🎨 YÊU CẦU THÊM SILKSCREEN_INK';
        break;
      case 'SR_PLUG_INK':
        emailSubject = '🎨 YÊU CẦU THÊM SR_PLUG_INK';
        break;
    }

    const emailBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
            background-color: #f9f9f9;
          }
          .header {
            background-color: #1890ff;
            color: white;
            padding: 15px;
            border-radius: 5px;
            text-align: center;
          }
          .content {
            background-color: white;
            padding: 20px;
            margin-top: 15px;
            border-radius: 5px;
          }
          .info-row {
            padding: 10px;
            border-bottom: 1px solid #eee;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .label {
            font-weight: bold;
            color: #1890ff;
            display: inline-block;
            width: 150px;
          }
          .value {
            color: #333;
          }
          .footer {
            margin-top: 20px;
            padding: 15px;
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            border-radius: 5px;
          }
          .timestamp {
            color: #666;
            font-size: 12px;
            text-align: right;
            margin-top: 15px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">🎨 YÊU CẦU THÊM MÀU MỰC</h2>
          </div>
          
          <div class="content">
            <div style="margin: 20px 0;">
              <div class="info-row">
                <span class="label">👤 Người yêu cầu:</span>
                <span class="value">${createdBy}</span>
              </div>
              <div class="info-row">
                <span class="label">🎨 Loại mực:</span>
                <span class="value"><strong>${type === 'SOLDERMASK_INK' ? 'SOLDERMASK_INK' :
        type === 'SILKSCREEN_INK' ? 'SILKSCREEN_INK' :
          type === 'SR_PLUG_INK' ? 'SR_PLUG_INK' : type
      }</strong></span>
              </div>
              <div class="info-row">
                <span class="label">🎨 Màu mực:</span>
                <span class="value"><strong>${color}</strong></span>
              </div>
              <div class="info-row">
                <span class="label">🎨 Tên mực:</span>
                <span class="value"><strong>${color_name}</strong></span>
              </div>
              <div class="info-row">
                <span class="label">⚙️ Method:</span>
                <span class="value">${method}</span>
              </div>
              <div class="info-row">
                <span class="label">🏭 Vendor:</span>
                <span class="value">${vendor}</span>
              </div>
            </div>
            <div class="timestamp">
              Thời gian gửi: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
            </div>
          </div>
          <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
            Email này được gửi tự động từ hệ thống Ink Management System<br>
            Vui lòng không trả lời email này.
          </p>
        </div>
      </body>
      </html>
    `;

    try {
      await sendMail({
        to: emailRecipients.join(','),
        subject: emailSubject,
        html: emailBody
      });
      console.log('Email sent successfully to:', emailRecipients.join(', '));
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      // Không throw error để không ảnh hưởng đến việc tạo request
    }

    res.status(201).json({
      success: true,
      message: 'Tạo yêu cầu thành công và đã gửi email thông báo',
      data: { id: newId }
    });

  } catch (error) {
    console.error('Error creating ink request:', error);
    if (connection) {
      await connection.rollback();
    }
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tạo yêu cầu',
      error: error.message
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error('Error closing connection:', error);
      }
    }
  }
});

router.put('/update/:id', authenticateToken, async (req, res) => {
  const id = req.params.id;
  const { color, method, vendor, type, color_name } = req.body;
  const updatedBy = req.user.username;
  let connection;

  try {
    connection = await getConnection();

    // Lấy thông tin trước khi update để kiểm tra trạng thái
    const currentRequest = await connection.execute(
      `SELECT STATUS, COLOR, METHOD, VENDOR, TYPE, COLOR_NAME, CREATED_BY 
       FROM INK_MANAGEMENT 
       WHERE ID = :id`,
      [id],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (currentRequest.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu'
      });
    }

    const currentStatus = currentRequest.rows[0].STATUS;

    await connection.execute(
      `UPDATE INK_MANAGEMENT 
       SET COLOR = :color,
           METHOD = :method, 
           VENDOR = :vendor,
           TYPE = :type,
           COLOR_NAME = :color_name,
           UPDATED_BY = :updatedBy,
           UPDATED_AT = SYSTIMESTAMP
       WHERE ID = :id`,
      {
        id: id,
        color: color,
        method: method,
        vendor: vendor,
        type: type,
        color_name: color_name,
        updatedBy: updatedBy
      }
    );

    await connection.commit();

    // Gửi email nếu trạng thái là APPROVED
    // Gửi email nếu trạng thái là APPROVED
    if (currentStatus === 'APPROVED') {
      // Lấy email của người cập nhật
      let updaterEmail = null;
      if (req.user && req.user.userId) {
        try {
          const userResult = await connection.execute(
            `SELECT email FROM users WHERE user_id = :userId AND (is_deleted = 0 OR is_deleted IS NULL)`,
            { userId: req.user.userId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          if (userResult.rows.length > 0) {
            updaterEmail = userResult.rows[0].EMAIL;
          }
        } catch (userError) {
          console.error('Error fetching updater email:', userError);
        }
      }

      // Tạo danh sách email (loại bỏ duplicate nếu có)
      const emailRecipients = [...AllEmails];
      if (updaterEmail && !emailRecipients.includes(updaterEmail)) {
        emailRecipients.push(updaterEmail);
      }

      const emailSubject = '🔄 CẬP NHẬT THÔNG TIN MÀU MỰC - ' + color;
      const emailBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background-color: #f9f9f9;
        }
        .header {
          background-color: #faad14;
          color: white;
          padding: 15px;
          border-radius: 5px;
          text-align: center;
        }
        .content {
          background-color: white;
          padding: 20px;
          margin-top: 15px;
          border-radius: 5px;
        }
        .info-row {
          padding: 10px;
          border-bottom: 1px solid #eee;
        }
        .info-row:last-child {
          border-bottom: none;
        }
        .label {
          font-weight: bold;
          color: #faad14;
          display: inline-block;
          width: 150px;
        }
        .value {
          color: #333;
        }
        .update-banner {
          margin-bottom: 20px;
          padding: 15px;
          background-color: #fffbe6;
          border-left: 4px solid #faad14;
          border-radius: 5px;
        }
        .timestamp {
          color: #666;
          font-size: 12px;
          text-align: right;
          margin-top: 15px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">🔄 CẬP NHẬT THÔNG TIN MÀU MỰC</h2>
        </div>
        
        <div class="content">
          <div class="update-banner">
            <strong>👤 Người cập nhật:</strong> ${updatedBy}
          </div>

          <div style="margin: 20px 0;">
            <div class="info-row">
              <span class="label">🎨 Loại mực:</span>
              <span class="value"><strong>${type === 'SOLDERMASK_INK' ? 'SOLDERMASK_INK' :
          type === 'SILKSCREEN_INK' ? 'SILKSCREEN_INK' :
            type === 'SR_PLUG_INK' ? 'SR_PLUG_INK' : type
        }</strong></span>
            </div>
            <div class="info-row">
              <span class="label">🎨 Màu mực:</span>
              <span class="value"><strong>${color}</strong></span>
            </div>
            <div class="info-row">
              <span class="label">🎨 Tên mực:</span>
              <span class="value"><strong>${color_name}</strong></span>
            </div>
            <div class="info-row">
              <span class="label">⚙️ Method:</span>
              <span class="value">${method}</span>
            </div>
            <div class="info-row">
              <span class="label">🏭 Vendor:</span>
              <span class="value">${vendor}</span>
            </div>
          </div>

          <div class="timestamp">
            Thời gian cập nhật: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
          </div>
        </div>

        <p style="text-align: center; color: #666; font-size: 12px; margin-top: 20px;">
          Email này được gửi tự động từ hệ thống Ink Management System<br>
          Vui lòng không trả lời email này.
        </p>
      </div>
    </body>
    </html>
  `;

      try {
        await sendMail({
          to: emailRecipients.join(','),
          subject: emailSubject,
          html: emailBody
        });
        console.log('Update email sent successfully to:', emailRecipients.join(', '));
      } catch (emailError) {
        console.error('Error sending update email:', emailError);
      }
    }

    res.json({
      success: true,
      message: currentStatus === 'APPROVED'
        ? 'Cập nhật thành công và đã gửi email thông báo'
        : 'Cập nhật thành công'
    });
  } catch (error) {
    console.error('Error updating ink request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update ink request'
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

// Approve ink request
router.put('/approve/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const updatedBy = req.user.username;
  let connection;

  try {
    connection = await getConnection();

    // Get current request info
    const currentRequest = await connection.execute(
      `SELECT COLOR, METHOD, VENDOR, CREATED_BY, COLOR_NAME FROM INK_MANAGEMENT WHERE ID = :id`,
      [id],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (currentRequest.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu'
      });
    }

    const request = currentRequest.rows[0];

    await connection.execute(
      `UPDATE INK_MANAGEMENT 
       SET UPDATED_BY = :updatedBy,
           UPDATED_AT = SYSTIMESTAMP,
           STATUS = 'APPROVED'
       WHERE ID = :id`,
      { id, updatedBy }
    );

    await connection.commit();

    const emailSubject = '✅ Đã cập nhật yêu cầu cho mực ' + request.COLOR;
    const emailBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
            background-color: #f9f9f9;
          }
          .header {
            background-color: #52c41a;
            color: white;
            padding: 15px;
            border-radius: 5px;
            text-align: center;
          }
          .content {
            background-color: white;
            padding: 20px;
            margin-top: 15px;
            border-radius: 5px;
          }
          .info-row {
            padding: 10px;
            border-bottom: 1px solid #eee;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .label {
            font-weight: bold;
            color: #52c41a;
            display: inline-block;
            width: 150px;
          }
          .value {
            color: #333;
          }
          .approved-banner {
            margin-top: 20px;
            padding: 15px;
            background-color: #f6ffed;
            border-left: 4px solid #52c41a;
            border-radius: 5px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">✅ Đã cập nhật màu mực theo yêu cầu</h2>
          </div>
          
          <div class="content">
            <div class="approved-banner">
              <strong>Yêu cầu đã được cập nhật :</strong> ${updatedBy}
            </div>

            <div style="margin: 20px 0;">
              <div class="info-row">
                <span class="label">👤 Người yêu cầu:</span>
                <span class="value">${request.CREATED_BY}</span>
              </div>
              <div class="info-row">
                <span class="label">🎨 Màu mực:</span>
                <span class="value"><strong>${request.COLOR}</strong></span>
              </div>
              <div class="info-row">
                <span class="label">🎨 Tên mực:</span>
                <span class="value"><strong>${request.COLOR_NAME}</strong></span>
              </div>
              <div class="info-row">
                <span class="label">⚙️Method:</span>
                <span class="value">${request.METHOD}</span>
              </div>
              <div class="info-row">
                <span class="label">🏭 Vendor:</span>
                <span class="value">${request.VENDOR}</span>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await sendMail({
        to: AllEmails.join(','),
        subject: emailSubject,
        html: emailBody
      });
    } catch (emailError) {
      console.error('Error sending approval email:', emailError);
    }

    res.json({
      success: true,
      message: 'Đã duyệt yêu cầu thành công'
    });

  } catch (error) {
    console.error('Error approving ink request:', error);
    if (connection) {
      await connection.rollback();
    }
    res.status(500).json({
      success: false,
      message: 'Lỗi khi duyệt yêu cầu',
      error: error.message
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error('Error closing connection:', error);
      }
    }
  }
});

router.put('/delete/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  let connection;

  try {
    connection = await getConnection();

    await connection.execute(
      `UPDATE INK_MANAGEMENT 
       SET IS_DELETED = 1
       WHERE ID = :id`,
      { id }
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Đã xóa yêu cầu thành công'
    });

  } catch (error) {
    console.error('Error deleting ink request:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa yêu cầu',
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

router.get('/list', authenticateToken, async (req, res) => {
  let connection;

  try {
    connection = await getConnection();

    const result = await connection.execute(
      `SELECT 
        ID, TYPE, COLOR, METHOD, VENDOR, COLOR_NAME,
        TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') as CREATED_AT,
        CREATED_BY,
        CASE 
          WHEN UPDATED_AT IS NOT NULL THEN TO_CHAR(UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS')
          ELSE NULL 
        END as UPDATED_AT,
        CASE 
          WHEN UPDATED_BY IS NOT NULL THEN UPDATED_BY
          ELSE NULL 
        END as UPDATED_BY,
        STATUS
      FROM INK_MANAGEMENT
      WHERE IS_DELETED = 0 OR IS_DELETED IS NULL
      ORDER BY CREATED_AT DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching ink requests:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách yêu cầu',
      error: error.message
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error('Error closing connection:', error);
      }
    }
  }
});

module.exports = router;