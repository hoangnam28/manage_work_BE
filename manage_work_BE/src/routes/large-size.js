const express = require('express');
const router = express.Router();
const database = require('../config/database');
const database2 = require('../config/database_2');
const oracledb = require('oracledb');
const { sendMail } = require('../helper/sendMail');
const jwt = require('jsonwebtoken');

oracledb.fetchAsBuffer = [oracledb.BLOB];
oracledb.autoCommit = true;


const AllEmails = [
  'nam.nguyenhoang@meiko-elec.com',
  'trang.nguyenkieu@meiko-elec.com'
];



const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token không hợp lệ' });
    }
    req.user = user;
    next();
  });
};

const checkBoPermission = async (req, res, next) => {
  try {
    if (!req.user.role || (Array.isArray(req.user.role) && !req.user.role.includes('bo')) || (typeof req.user.role === 'editor' && !req.user.role.split(',').includes('bo'))) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
    }
    next();
  } catch (error) {
    console.error('Error checking bo permission:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

// Áp dụng middleware cho tất cả các routes
router.use(authenticateToken);
router.use(checkBoPermission);

router.get('/customers', async (req, res) => {
  let connection;
  try {
    connection = await database2.getConnection();

    const result = await connection.execute(
      `SELECT DISTINCT TRIM(customer_part_number) as customer_part_number 
       FROM admin.data0050 
       WHERE customer_part_number IS NOT NULL 
       AND TRIM(customer_part_number) IS NOT NULL
       AND LENGTH(TRIM(customer_part_number)) > 0
       ORDER BY TRIM(customer_part_number)`,
      [],
      {
        maxRows: 0,
        fetchArraySize: 2000,
        outFormat: oracledb.OUT_FORMAT_OBJECT
      }
    );

    const uniqueCustomers = [...new Set(
      result.rows
        .map(row => (row.CUSTOMER_PART_NUMBER || '').trim())
        .filter(customer => customer.length > 0)
    )];
    const customers = uniqueCustomers.map(customer => ({
      customer_part_number: customer
    }));

    res.json(customers);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});


router.get('/list', async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT id, customer_code, type_board, size_normal, rate_normal, size_big, rate_big, request, confirm_by, note, is_deleted, is_canceled FROM large_size where is_deleted = 0`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});
router.post('/create', async (req, res) => {
  console.log('POST /large-size/create body:', req.body);
  console.log('req.user:', req.user);
  let connection;
  try {
    const {
      customer_part_number,
      type_board,
      size_normal,
      rate_normal,
      size_big,
      rate_big,
      request,
      confirm_by,
      note
    } = req.body;

    if (!customer_part_number || !type_board) {
      return res.status(400).json({ error: 'customer_part_number và type_board là bắt buộc', message: 'Vui lòng nhập đầy đủ mã sản phẩm và loại bo.' });
    }

    // Thêm dòng này để lấy connection
    connection = await database.getConnection();

    // Kiểm tra trùng mã hàng (customer_code) chưa bị xóa mềm
    const checkExist = await connection.execute(
      `SELECT COUNT(1) as CNT FROM large_size WHERE customer_code = :code AND is_deleted = 0`,
      { code: customer_part_number },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (checkExist.rows[0] && checkExist.rows[0].CNT > 0) {
      return res.status(400).json({ error: 'Mã sản phẩm đã tồn tại, không được tạo trùng.', message: 'Mã sản phẩm đã tồn tại, không được tạo trùng.' });
    }

    // Truy vấn email của user từ database
    let creatorEmail = null;
    if (req.user && req.user.userId) {
      try {
        const userResult = await connection.execute(
          `SELECT email FROM users WHERE user_id = :userId AND is_deleted = 0`,
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

    console.log('creatorEmail:', creatorEmail);

    const idResult = await connection.execute(`SELECT large_size_seq.NEXTVAL as ID FROM DUAL`);
    const nextId = idResult.rows[0][0];

    await connection.execute(
      `INSERT INTO large_size (
        id, customer_code, type_board, size_normal, rate_normal, size_big, rate_big, request, confirm_by, note, created_by_email
      ) VALUES (
        :id, :customer_code, :type_board, :size_normal, :rate_normal, :size_big, :rate_big, :request, :confirm_by, :note, :created_by_email
      )`,
      {
        id: nextId,
        customer_code: customer_part_number,
        type_board,
        size_normal,
        rate_normal,
        size_big,
        rate_big,
        request,
        confirm_by,
        note,
        created_by_email: creatorEmail
      },
      { autoCommit: false }
    );

    // Lưu lịch sử tạo mới
    const historyIdResult = await connection.execute(`SELECT large_size_history_seq.NEXTVAL as ID FROM DUAL`);
    const historyId = historyIdResult.rows[0][0];

    await connection.execute(
      `INSERT INTO large_size_history (
        history_id, id, type_board, size_normal, rate_normal, size_big, rate_big, 
        request, confirm_by, note, customer_code, is_deleted, created_by_email, 
        action_by_email, action_at, action_type
      ) VALUES (
        :history_id, :id, :type_board, :size_normal, :rate_normal, :size_big, :rate_big,
        :request, :confirm_by, :note, :customer_code, :is_deleted, :created_by_email,
        :action_by_email, CURRENT_TIMESTAMP, 'CREATE'
      )`,
      {
        history_id: historyId,
        id: nextId,
        type_board: type_board || '',
        size_normal: size_normal || '',
        rate_normal: rate_normal || '',
        size_big: size_big || '',
        rate_big: rate_big || '',
        request: request || '',
        confirm_by: confirm_by || '',
        note: note || '',
        customer_code: customer_part_number,
        is_deleted: 0,
        created_by_email: creatorEmail,
        action_by_email: creatorEmail
      },
      { autoCommit: false }
    );

    await connection.commit();

    // Gửi mail thông báo yêu cầu xác nhận
    const feUrl = `http://192.84.105.173:8888/decide-board/${nextId}`;
    const subject = `Yêu cầu xác nhận sử dụng bo to của mã hàng: ${customer_part_number}`;
    const html = `
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <th align="left">Mã sản phẩm</th>
      <td>${customer_part_number}</td>
    </tr>
    <tr>
      <th align="left">Loại bo</th>
      <td>${type_board}</td>
    </tr>
    <tr>
      <th align="left">Kích thước Tối ưu</th>
      <td>${size_normal}</td>
    </tr>
    <tr>
      <th align="left">Tỷ lệ % (Bo thường)</th>
      <td>${rate_normal}</td>
    </tr>
    <tr>
      <th align="left">Kích thước bo to</th>
      <td>${size_big}</td>
    </tr>
    <tr>
      <th align="left">Tỷ lệ % (Bo to)</th>
      <td>${rate_big}</td>
    </tr>
    <tr>
      <th align="left">Yêu cầu sử dụng bo to</th>
    </tr>
    <tr>
      <th align="left">Ghi chú</th>
      <td>${note}</td>
    </tr>
    <tr>
      <th align="left" colspan="2" style="color:#d48806;">Yêu cầu xác nhận sử dụng bo to!</th>
    </tr>
    </table>
    <br>
    <a href="${feUrl}">Link Xem chi tiết mã hàng cần xác nhận</a>
    <br>
    <br>
    <p>Đây là email tự động từ hệ thống. Vui lòng không reply - Cảm ơn!</p>
    <p>This is an automated email sent from the system. Please do not reply to all - Thank you!</p>
`;
    let recipients = [...AllEmails];
    if (creatorEmail && !recipients.includes(creatorEmail)) {
      recipients.push(creatorEmail);
    }
    recipients = [...new Set(recipients)];

    console.log('Final recipients:', recipients);
    sendMail(subject, html, recipients).catch(console.error);

    res.status(201).json({ success: true, id: nextId, message: 'Tạo mới thành công!' });
  } catch (err) {
    console.error('Error in POST /create:', err);
    // Ưu tiên trả về message rõ ràng nếu có
    if (err && err.message) {
      return res.status(500).json({ error: err.message, message: err.message });
    }
    res.status(500).json({ error: 'Lỗi server', message: 'Lỗi server' });
  } finally {
    if (connection) await connection.close();
  }
});
router.put('/update/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const {
      confirm_by,
      request,
      type_board,
      size_normal,
      rate_normal,
      size_big,
      rate_big,
      note,
      customer_code
    } = req.body;

    connection = await database.getConnection();

    // Không cho phép sửa mã sản phẩm
    if (typeof customer_code !== 'undefined') {
      return res.status(400).json({ error: 'Không được phép sửa mã sản phẩm' });
    }

    // Lấy thông tin cũ để so sánh
    const oldResult = await connection.execute(
      `SELECT customer_code, type_board, size_normal, rate_normal, size_big, rate_big, note, request, confirm_by FROM large_size WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const oldRow = oldResult.rows[0] || {};

    // Xây dựng câu lệnh update động
    const fields = [];
    const binds = { id };
    if (typeof confirm_by !== 'undefined') {
      fields.push('confirm_by = :confirm_by');
      binds.confirm_by = confirm_by;
    }
    if (typeof request !== 'undefined') {
      fields.push('request = :request');
      binds.request = request;
    }
    if (typeof type_board !== 'undefined') {
      fields.push('type_board = :type_board');
      binds.type_board = type_board;
    }
    if (typeof size_normal !== 'undefined') {
      fields.push('size_normal = :size_normal');
      binds.size_normal = size_normal;
    }
    if (typeof rate_normal !== 'undefined') {
      fields.push('rate_normal = :rate_normal');
      binds.rate_normal = rate_normal;
    }
    if (typeof size_big !== 'undefined') {
      fields.push('size_big = :size_big');
      binds.size_big = size_big;
    }
    if (typeof rate_big !== 'undefined') {
      fields.push('rate_big = :rate_big');
      binds.rate_big = rate_big;
    }
    if (typeof note !== 'undefined') {
      fields.push('note = :note');
      binds.note = note;
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Không có trường nào để cập nhật' });
    }

    // Lấy email của user hiện tại
    let actionByEmail = null;
    if (req.user && req.user.userId) {
      try {
        const userResult = await connection.execute(
          `SELECT email FROM users WHERE user_id = :userId AND is_deleted = 0`,
          { userId: req.user.userId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (userResult.rows.length > 0) {
          actionByEmail = userResult.rows[0].EMAIL;
        }
      } catch (userError) {
        console.error('Error fetching user email:', userError);
      }
    }

    // Lưu lịch sử trước khi update
    const historyIdResult = await connection.execute(`SELECT large_size_history_seq.NEXTVAL as ID FROM DUAL`);
    const historyId = historyIdResult.rows[0][0];

    await connection.execute(
      `INSERT INTO large_size_history (
    history_id, id, type_board, size_normal, rate_normal, size_big, rate_big, 
    request, confirm_by, note, customer_code, is_deleted, created_by_email, 
    action_by_email, action_at, action_type
  ) VALUES (
    :history_id, :id, :type_board, :size_normal, :rate_normal, :size_big, :rate_big,
    :request, :confirm_by, :note, :customer_code, :is_deleted, :created_by_email,
    :action_by_email, CURRENT_TIMESTAMP, 'UPDATE'
  )`,
      {
        history_id: historyId,
        id: id,
        // Lưu giá trị MỚI nếu có update, nếu không thì lưu giá trị cũ
        type_board: typeof type_board !== 'undefined' ? type_board : (oldRow.TYPE_BOARD || ''),
        size_normal: typeof size_normal !== 'undefined' ? size_normal : (oldRow.SIZE_NORMAL || ''),
        rate_normal: typeof rate_normal !== 'undefined' ? rate_normal : (oldRow.RATE_NORMAL || ''),
        size_big: typeof size_big !== 'undefined' ? size_big : (oldRow.SIZE_BIG || ''),
        rate_big: typeof rate_big !== 'undefined' ? rate_big : (oldRow.RATE_BIG || ''),
        request: typeof request !== 'undefined' ? request : (oldRow.REQUEST || ''),
        confirm_by: typeof confirm_by !== 'undefined' ? confirm_by : (oldRow.CONFIRM_BY || ''), // ← Sửa ở đây
        note: typeof note !== 'undefined' ? note : (oldRow.NOTE || ''),
        customer_code: oldRow.CUSTOMER_CODE || '',
        is_deleted: 0,
        created_by_email: oldRow.CREATED_BY_EMAIL || '',
        action_by_email: actionByEmail
      },
      { autoCommit: false }
    );

    // Kiểm tra các trường quan trọng có thay đổi không (KHÔNG tính request)
    const importantFields = [
      { key: 'type_board', old: oldRow.TYPE_BOARD, new: type_board },
      { key: 'size_normal', old: oldRow.SIZE_NORMAL, new: size_normal },
      { key: 'size_big', old: oldRow.SIZE_BIG, new: size_big },
      { key: 'rate_normal', old: oldRow.RATE_NORMAL, new: rate_normal },
      { key: 'rate_big', old: oldRow.RATE_BIG, new: rate_big }
    ];
    const hasImportantChange = importantFields.some(f => typeof f.new !== 'undefined' && String(f.old || '').trim() !== String(f.new || '').trim());

    // Lấy giá trị request cũ để kiểm tra thay đổi riêng
    let oldRequest = null;
    if (typeof request !== 'undefined') {
      const oldReqResult = await connection.execute(
        `SELECT request FROM large_size WHERE id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      oldRequest = oldReqResult.rows[0] ? oldReqResult.rows[0].REQUEST : null;
    }

    // Nếu có cập nhật trường quan trọng và không phải là xác nhận, reset confirm_by
    // if (hasImportantChange && typeof confirm_by === 'undefined') {
    //   fields.push('confirm_by = :reset_confirm_by');
    //   binds.reset_confirm_by = '';
    // }

    const sql = `UPDATE large_size SET ${fields.join(', ')} WHERE id = :id`;
    await connection.execute(sql, binds, { autoCommit: false });

    await connection.commit();

    // Lấy thông tin mã hàng sau khi update
    const result = await connection.execute(
      `SELECT customer_code, type_board, size_normal, rate_normal, size_big, rate_big, note, request, created_by_email FROM large_size WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = result.rows[0] || {};

    let creatorEmail = row.CREATED_BY_EMAIL;
    if (!creatorEmail) {
      creatorEmail = null;
    }

    const feUrl = `http://192.84.105.173:8888/decide-board/${id}`;
    const isUseLarge = (row.REQUEST || request) === 'TRUE';

    // Xử lý gửi mail dựa trên trường hợp
    if (typeof confirm_by !== 'undefined' && confirm_by !== '') {
      // Trường hợp xác nhận
      const subject = `Đã xác nhận yêu cầu sử dụng bo to của mã hàng: ${row.CUSTOMER_CODE || ''}`;
      const html = `
        <table border=\"1\" cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;\">
         <tr>
           <th align=\"left\">Mã sản phẩm</th>
            <td>${row.CUSTOMER_CODE || ''}</td>
         </tr>
          <tr>
            <th align=\"left\">Loại bo</th>
            <td>${row.TYPE_BOARD || ''}</td>
          </tr>          
          <tr>            
          <th align=\"left\">Kích thước Tối ưu</th>
            <td>${row.SIZE_NORMAL || ''}</td>
          </tr>         
          <tr>            
          <th align=\"left\">Tỷ lệ % (Bo thường)</th>
           <td>${row.RATE_NORMAL || ''}</td>
          </tr>
          <tr>            
          <th align=\"left\">Kích thước bo to</th>
          <td>${row.SIZE_BIG || ''}</td>
          </tr>        
          <tr>
            <th align=\"left\">Tỷ lệ % (Bo to)</th>
            <td>${row.RATE_BIG || ''}</td>
          </tr>
          <tr>
            <th align=\"left\">Người xác nhận</th>
            <td>${confirm_by}</td>
           </tr>
          <tr>
            <th align=\"left\">Xác nhận ngày</th>
            <td>${new Date().toLocaleString()}</td>
         </tr>
           <tr>
           <th align=\"left\">Yêu cầu sử dụng bo to</th>
              <td>${isUseLarge ? 'Có' : 'Không'}</td>
            </tr>
          <tr>
           <th align=\"left\">Ghi chú</th>        
           <td>${row.NOTE || ''}</td>
         </tr> 
           </table>
          <br>
           <a href=\"${feUrl}\">Link Xem chi tiết mã hàng đã xác nhận</a>
           <br>
           <br>
         <p>Đây là email tự động từ hệ thống. Vui lòng không reply - Cảm ơn!</p>\n
         <p>This is an automated email sent from the system. Please do not reply to all - Thank you!</p>      `;

      let recipients = [];

      if (!isUseLarge) {
        // Nếu xác nhận 'Không': gửi cho người tạo và toàn bộ mail của bên PC
        recipients = [...AllEmails];
        if (creatorEmail && !recipients.includes(creatorEmail)) {
          recipients.push(creatorEmail);
        }
      } else {
        // Nếu xác nhận 'Có': gửi cho tất cả các bên (người tạo, PC, CI, TK)
        recipients = [...AllEmails];
        if (creatorEmail && !recipients.includes(creatorEmail)) {
          recipients.push(creatorEmail);
        }
      }

      recipients = [...new Set(recipients)];
      sendMail(subject, html, recipients).catch(console.error);
    }
    // else if (hasImportantChange) {
    //   // Trường hợp cập nhật thông tin quan trọng - gửi mail yêu cầu xác nhận lại
    //   const subject = `Yêu cầu xác nhận lại thông tin mã hàng: ${row.CUSTOMER_CODE || ''}`;
    //   const html = `
    //     <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
    //       <tr>
    //         <th align="left">Mã sản phẩm</th>
    //         <td>${row.CUSTOMER_CODE || ''}</td>
    //       </tr>
    //       <tr>
    //         <th align="left">Loại bo</th>
    //         <td>${row.TYPE_BOARD || ''}</td>
    //       </tr>
    //       <tr>
    //         <th align="left">Kích thước Tối ưu</th>
    //         <td>${row.SIZE_NORMAL || ''}</td>
    //       </tr>
    //       <tr>
    //         <th align="left">Tỷ lệ % (Bo thường)</th>
    //         <td>${row.RATE_NORMAL || ''}</td>
    //       </tr>
    //       <tr>
    //         <th align="left">Kích thước bo to</th>
    //         <td>${row.SIZE_BIG || ''}</td>
    //       </tr>
    //       <tr>
    //         <th align="left">Tỷ lệ % (Bo to)</th>
    //         <td>${row.RATE_BIG || ''}</td>
    //       </tr>
    //       <tr>
    //         <th align="left">Yêu cầu sử dụng bo to</th>
    //         <td>${isUseLarge ? 'Có' : 'Không'}</td>
    //       </tr>
    //       <tr>
    //         <th align="left">Ghi chú</th>
    //         <td>${row.NOTE || ''}</td>
    //       </tr>
    //       <tr>
    //         <th align="left" colspan="2" style="color:#d48806;">Thông tin đã được cập nhật - Yêu cầu xác nhận lại!</th>
    //       </tr>
    //     </table>
    //     <br>
    //     <a href="${feUrl}">Link Xem chi tiết mã hàng cần xác nhận lại</a>
    //     <br>
    //     <br>
    //     <p>Đây là email tự động từ hệ thống. Vui lòng không reply - Cảm ơn!</p>
    //     <p>This is an automated email sent from the system. Please do not reply to all - Thank you!</p>
    //   `;
    //   // Gửi cho PC và người tạo (giống như khi tạo mới)
    //   let recipients = [...pcEmails];
    //   if (creatorEmail && !recipients.includes(creatorEmail)) {
    //     recipients.push(creatorEmail);
    //   }
    //   recipients = [...new Set(recipients)];
    //   console.log('Sending reconfirmation email to:', recipients);
    //   sendMail(subject, html, recipients).catch(console.error);
    // }

    // Gửi mail khi thay đổi trường request (Có <-> Không), giữ nguyên trạng thái và người xác nhận
    if (
      typeof request !== 'undefined' &&
      oldRequest !== null &&
      oldRequest !== '' &&
      String(oldRequest).toUpperCase() !== String(request).toUpperCase() &&
      oldRow.CONFIRM_BY &&
      oldRow.CONFIRM_BY.trim() !== '' &&
      !hasImportantChange // Thêm điều kiện này
    ) {
      let userName = req.user && req.user.username ? req.user.username : '';
      if (userName) {
        await connection.execute(
          `UPDATE large_size SET confirm_by = :userName WHERE id = :id`,
          { userName, id },
          { autoCommit: true }
        );
      }
      const subject = `PC đã sửa xác nhận Yêu cầu sử dụng bo to của mã hàng: ${row.CUSTOMER_CODE || ''}`;
      const html = `
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <th align="left">Mã sản phẩm</th>
            <td>${row.CUSTOMER_CODE || ''}</td>
          </tr>
          <tr>
            <th align="left">Loại bo</th>
            <td>${row.TYPE_BOARD || ''}</td>
          </tr>
          <tr>
            <th align="left">Kích thước Tối ưu</th>
            <td>${row.SIZE_NORMAL || ''}</td>
          </tr>
          <tr>
            <th align="left">Tỷ lệ % (Bo thường)</th>
            <td>${row.RATE_NORMAL || ''}</td>
          </tr>
          <tr>
            <th align="left">Kích thước bo to</th>
            <td>${row.SIZE_BIG || ''}</td>
          </tr>
          <tr>
            <th align="left">Tỷ lệ % (Bo to)</th>
            <td>${row.RATE_BIG || ''}</td>
          </tr>
          <tr>
            <th align="left">Yêu cầu sử dụng bo to sau sửa</th>
            <td>${String(request).toUpperCase() === 'TRUE' ? 'Có' : 'Không'}</td>
          </tr>
          <tr>
            <th align="left">Yêu cầu sử dụng bo to trước sửa</th>
            <td>${String(oldRequest).toUpperCase() === 'TRUE' ? 'Có' : 'Không'}</td>
          </tr>
          <tr>
            <th align="left">Người xác nhận hiện tại</th>
            <td>${userName}</td>
          </tr>
          <tr>
            <th align="left">Ghi chú</th>
            <td>${row.NOTE || ''}</td>
          </tr>
          <tr>
            <th align="left" colspan="2" style="color:#d48806;">PC đã sửa xác nhận Yêu cầu sử dụng bo to!</th>
          </tr>
        </table>
        <br>
        <a href="${feUrl}">Link Xem chi tiết mã hàng</a>
        <br>
        <br>
        <p>Đây là email tự động từ hệ thống. Vui lòng không reply - Cảm ơn!</p>
        <p>This is an automated email sent from the system. Please do not reply to all - Thank you!</p>
      `;
      // Gửi cho tất cả các bên (người tạo, PC, CI, TK)
      let recipients = [...AllEmails];
      if (creatorEmail && !recipients.includes(creatorEmail)) {
        recipients.push(creatorEmail);
      }
      recipients = [...new Set(recipients)];
      sendMail(subject, html, recipients).catch(console.error);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error in PUT /update/:id:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

router.delete('/delete/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  // Validate
  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ message: 'ID không hợp lệ' });
  }

  let connection;
  try {
    connection = await database.getConnection();

    // Single query - soft delete
    const result = await connection.execute(
      `UPDATE large_size 
       SET is_deleted = 1
       WHERE id = :id AND is_deleted = 0`,
      { id: Number(id) },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }

    res.json({ message: 'Xóa thành công', success: true });

  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeErr) {
        console.error('Close connection error:', closeErr);
      }
    }
  }
});

// API khôi phục bản ghi đã xóa
router.put('/restore/:id', async (req, res) => {
  let { id } = req.params;
  let connection;
  try {
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        message: 'ID không hợp lệ'
      });
    }
    id = Number(id);
    connection = await database.getConnection();

    // Lấy thông tin bản ghi trước khi khôi phục
    const oldResult = await connection.execute(
      `SELECT * FROM large_size WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (oldResult.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }

    const oldRow = oldResult.rows[0];

    // Lấy email của user hiện tại
    let actionByEmail = null;
    if (req.user && req.user.userId) {
      try {
        const userResult = await connection.execute(
          `SELECT email FROM users WHERE user_id = :userId`,
          { userId: req.user.userId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (userResult.rows.length > 0) {
          actionByEmail = userResult.rows[0].EMAIL;
        }
      } catch (userError) {
        console.error('Error fetching user email:', userError);
      }
    }

    // Lưu lịch sử trước khi khôi phục
    const historyIdResult = await connection.execute(`SELECT large_size_history_seq.NEXTVAL as ID FROM DUAL`);
    const historyId = historyIdResult.rows[0][0];

    await connection.execute(
      `INSERT INTO large_size_history (
        history_id, id, type_board, size_normal, rate_normal, size_big, rate_big, 
        request, confirm_by, note, customer_code, is_deleted, created_by_email, 
        action_by_email, action_at, action_type
      ) VALUES (
        :history_id, :id, :type_board, :size_normal, :rate_normal, :size_big, :rate_big,
        :request, :confirm_by, :note, :customer_code, :is_deleted, :created_by_email,
        :action_by_email, CURRENT_TIMESTAMP, 'RESTORE'
      )`,
      {
        history_id: historyId,
        id: id,
        type_board: oldRow.TYPE_BOARD || '',
        size_normal: oldRow.SIZE_NORMAL || '',
        rate_normal: oldRow.RATE_NORMAL || '',
        size_big: oldRow.SIZE_BIG || '',
        rate_big: oldRow.RATE_BIG || '',
        request: oldRow.REQUEST || '',
        confirm_by: oldRow.CONFIRM_BY || '',
        note: oldRow.NOTE || '',
        customer_code: oldRow.CUSTOMER_CODE || '',
        is_deleted: 0,
        created_by_email: oldRow.CREATED_BY_EMAIL || '',
        action_by_email: req.user?.username || actionByEmail || ''
      },
      { autoCommit: false }
    );

    const result = await connection.execute(
      `UPDATE large_size SET is_canceled = 0 WHERE id = :id`,
      { id },
      { autoCommit: false }
    );

    await connection.commit();

    const emailContent = `
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <th align="left">Mã sản phẩm</th>
      <td>${oldRow.CUSTOMER_CODE || ''}</td>
    </tr>
    <tr>
      <th align="left">Loại bo</th>
      <td>${oldRow.TYPE_BOARD || ''}</td>
    </tr>
    <tr>
      <th align="left">Kích thước Tối ưu</th>
      <td>${oldRow.SIZE_NORMAL || ''}</td>
    </tr>
    <tr>
      <th align="left">Tỷ lệ % (Bo thường)</th>
      <td>${oldRow.RATE_NORMAL || ''}</td>
    </tr>
    <tr>
      <th align="left">Kích thước bo to</th>
      <td>${oldRow.SIZE_BIG || ''}</td>
    </tr>
    <tr>
      <th align="left">Tỷ lệ % (Bo to)</th>
      <td>${oldRow.RATE_BIG || ''}</td>
    </tr>
    <tr>
      <th align="left">Người khôi phục</th>
      <td>${req.user?.username || actionByEmail || 'N/A'}</td>
    </tr>
  </table>
  <br>
  <a href="http://192.84.105.173:8888/decide-board/${id}">Link xem chi tiết</a>
  <br>
  <br>
  <p>Đây là email tự động từ hệ thống. Vui lòng không reply - Cảm ơn!</p>
  <p>This is an automated email sent from the system. Please do not reply to all - Thank you!</p>
`;

    const mailRecipients = [...new Set([
      ...AllEmails,
      oldRow.CREATED_BY_EMAIL,
    ].filter(Boolean))];

    sendMail(
      `Đã khôi phục yêu cầu sử dụng bo to mã hàng: ${oldRow.CUSTOMER_CODE || ''}`,
      emailContent,
      mailRecipients
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }
    res.json({
      message: 'Khôi phục thành công',
      id: id
    });
  } catch (err) {
    console.error('Error restoring record:', err);
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
    }
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

router.get('/detail/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT * FROM large_size WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy mã hàng' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

// API lấy lịch sử chỉnh sửa của một mã hàng
router.get('/history/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await database.getConnection();

    const result = await connection.execute(
      `SELECT 
        history_id,
        id,
        type_board,
        size_normal,
        rate_normal,
        size_big,
        rate_big,
        request,
        confirm_by,
        note,
        customer_code,
        is_deleted,
        created_by_email,
        action_by_email,
        TO_CHAR(action_at, 'DD/MM/YYYY HH24:MI:SS') as action_at,
        action_type
       FROM large_size_history 
       WHERE id = :id 
       ORDER BY action_at DESC`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});


// API hủy yêu cầu sử dụng bo (chỉ khi chưa xác nhận)
router.put('/cancel-request/:id', async (req, res) => {
  let { id } = req.params;
  let connection;
  try {
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ message: 'ID không hợp lệ' });
    }
    id = Number(id);
    connection = await database.getConnection();

    // Lấy thông tin bản ghi
    const recordInfo = await connection.execute(
      `SELECT customer_code, type_board, size_normal, rate_normal, size_big, rate_big, request, confirm_by, note, created_by_email, is_canceled FROM large_size WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const record = recordInfo.rows[0];
    if (!record) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }
    if (record.IS_CANCELED === 1) {
      return res.status(400).json({ message: 'Bản ghi đã bị hủy trước đó.' });
    }

    // Thực hiện cập nhật is_canceled = 1
    await connection.execute(
      `UPDATE large_size SET is_canceled = 1 WHERE id = :id`,
      { id },
      { autoCommit: false }
    );

    // Lưu lịch sử hủy
    const historyId = await connection.execute(`SELECT large_size_history_seq.NEXTVAL FROM DUAL`);
    await connection.execute(
      `INSERT INTO large_size_history (
        history_id, id, type_board, size_normal, rate_normal, size_big, rate_big,
        request, confirm_by, note, customer_code, is_deleted, created_by_email,
        action_by_email, action_at, action_type
      ) VALUES (
        :history_id, :id, :type_board, :size_normal, :rate_normal, :size_big, :rate_big,
        :request, :confirm_by, :note, :customer_code, 0, :created_by_email,
        :action_by_email, CURRENT_TIMESTAMP, 'CANCEL'
      )`,
      {
        history_id: historyId.rows[0][0],
        id,
        type_board: record.TYPE_BOARD || '',
        size_normal: record.SIZE_NORMAL || '',
        rate_normal: record.RATE_NORMAL || '',
        size_big: record.SIZE_BIG || '',
        rate_big: record.RATE_BIG || '',
        request: record.REQUEST || '',
        confirm_by: record.CONFIRM_BY || '',
        note: record.NOTE || '',
        customer_code: record.CUSTOMER_CODE,
        created_by_email: record.CREATED_BY_EMAIL || '',
        action_by_email: req.user?.username || ''
      },
      { autoCommit: false }
    );

    await connection.commit();

    // Gửi email thông báo
    const emailContent = `
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <th align="left">Mã sản phẩm</th>
          <td>${record.CUSTOMER_CODE}</td>
        </tr>
        <tr>
          <th align="left">Loại bo</th>
          <td>${record.TYPE_BOARD || ''}</td>
        </tr>
        <tr>
          <th align="left">Kích thước Tối ưu</th>
          <td>${record.SIZE_NORMAL || ''}</td>
        </tr>
        <tr>
          <th align="left">Tỷ lệ % (Bo thường)</th>
          <td>${record.RATE_NORMAL || ''}</td>
        </tr>
        <tr>
          <th align="left">Kích thước bo to</th>
          <td>${record.SIZE_BIG || ''}</td>
        </tr>
        <tr>
          <th align="left">Tỷ lệ % (Bo to)</th>
          <td>${record.RATE_BIG || ''}</td>
        </tr>
        <tr>
          <th align="left">Người hủy</th>
          <td>${req.user?.username || 'N/A'}</td>
        </tr>
      </table>
      <br>
      <a href="http://192.84.105.173:8888/decide-board/${id}">Link xem chi tiết</a>
      <br>
      <br>
      <p>Đây là email tự động từ hệ thống. Vui lòng không reply - Cảm ơn!</p>
      <p>This is an automated email sent from the system. Please do not reply to all - Thank you!</p>
    `;

    const mailRecipients = [...new Set([
      ...AllEmails,
      record.CREATED_BY_EMAIL,
      record.ACTION_BY_EMAIL,
    ].filter(Boolean))];

    sendMail(
      `Đã hủy yêu cầu sử dụng bo to mã hàng: ${record.CUSTOMER_CODE}`,
      emailContent,
      mailRecipients
    );

    res.json({
      success: true, // Thêm field success để frontend dễ check
      message: 'Hủy yêu cầu thành công',
      id: id,
      data: {
        id: id,
        customer_code: record.CUSTOMER_CODE,
        is_deleted: 1
      }
    });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (e) { }
    }
    console.error('Error in PUT /cancel/:id:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) try { await connection.close(); } catch (e) { }
  }
});
module.exports = router;