const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const database = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Trong file config database
oracledb.fetchAsBuffer = [ oracledb.BLOB ];
oracledb.autoCommit = true;
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

router.post('/add', async (req, res) => {
    const { ma, khach_hang, ma_tai_lieu, created_by } = req.body;
    let connection;
    try {
        connection = await database.getConnection();
        const seqResult = await connection.execute(
            `SELECT seq_document_columns.NEXTVAL as next_stt FROM DUAL`
        );
        const stt = seqResult.rows[0][0];
        const result = await connection.execute(
            `INSERT INTO document_columns (
                column_id, stt, ma, khach_hang, ma_tai_lieu, doi tuong,
                created_by, created_at
            ) VALUES (
                seq_document_columns.NEXTVAL, :stt, :ma, :khach_hang, :ma_tai_lieu,
                :created_by, CURRENT_TIMESTAMP
            )`,
            { 
                stt,
                ma, 
                khach_hang, 
                ma_tai_lieu,
                doi_tuong,
                created_by
            },
            { autoCommit: true }
        );
        
        res.json({ 
            message: 'Thêm dữ liệu thành công', 
            id: result.lastRowid,
            data: {
                stt,
                ma,
                khach_hang,
                ma_tai_lieu,
                doi_tuong,
                created_by
            }
        });
    } catch (err) {
        console.error('Error adding record:', err);
        res.status(500).json({ 
            message: 'Lỗi server', 
            error: err.message 
        });
    } finally {
        if (connection) await connection.close();
    }
});

router.put('/update/:column_id', async (req, res) => {
  const { column_id } = req.params;
  const { edited_by, ...data } = req.body;
  let connection;

  try {
    connection = await database.getConnection();
    
    // Lấy dữ liệu cũ để so sánh
    const oldDataResult = await connection.execute(
      `SELECT * FROM document_columns WHERE column_id = :column_id`,
      { column_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (oldDataResult.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi' });
    }

    const oldData = oldDataResult.rows[0];
    
    // Cập nhật dữ liệu không sử dụng formattedData
    await connection.execute(
      `UPDATE document_columns SET 
        ma = :ma,
        khach_hang = :khach_hang,
        doi_tuong = :doi_tuong,
        ma_tai_lieu = :ma_tai_lieu,
        rev = :rev,
        cong_venh = :cong_venh,
        v_cut = :v_cut,
        xu_ly_be_mat = :xu_ly_be_mat,
        ghi_chu = :ghi_chu
      WHERE column_id = :column_id`,
      { 
        ma: data.ma,
        khach_hang: data.khach_hang,
        doi_tuong: data.doi_tuong,
        ma_tai_lieu: data.ma_tai_lieu,
        rev: data.rev,
        cong_venh: data.cong_venh,
        v_cut: data.v_cut,
        xu_ly_be_mat: data.xu_ly_be_mat,
        ghi_chu: data.ghi_chu,
        column_id
      }
    );

    // Lưu lịch sử chỉnh sửa
    for (const [field, newValue] of Object.entries(data)) {
      if (field !== 'edited_by') {
        const oldValue = oldData[field.toUpperCase()];

        let formattedOldValue = oldValue;
        let formattedNewValue = newValue;

        if (formattedOldValue !== formattedNewValue) {
          await connection.execute(
            `INSERT INTO edit_history (
              history_id,
              column_id,
              field_name,
              old_value,
              new_value,
              edited_by,
              edit_time
            ) VALUES (
              edit_history_seq.NEXTVAL,
              :column_id,
              :field_name,
              :old_value,
              :new_value,
              :edited_by,
              CURRENT_TIMESTAMP
            )`,
            {
              column_id,
              field_name: field.toUpperCase(),
              old_value: formattedOldValue?.toString() || '',
              new_value: formattedNewValue?.toString() || '',
              edited_by
            }
          );
        }
      }
    }

    await connection.commit();
    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('Error updating record:', err);
    
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
    }
    
    res.status(500).json({ 
      message: 'Lỗi khi cập nhật',
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

// Xóa dữ liệu
router.delete('/delete/:column_id', async (req, res) => {
    const { column_id } = req.params;
    let connection;
    try {
        connection = await database.getConnection();
        await connection.execute(
            `DELETE FROM document_columns WHERE column_id = :column_id`,
              { column_id },
            { autoCommit: true }
        );
        res.json({ message: 'Xóa thành công' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server' });
    } finally {
        if (connection) await connection.close();
    }
});

// Cấu hình multer để lưu file vào thư mục uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// API upload hình ảnh
router.post('/upload-images/:column_id/:field', upload.array('images', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'Không có file nào được tải lên' });
  }

  const { column_id, field } = req.params;
  let connection;

  try {
    connection = await database.getConnection();
    const insertPromises = req.files.map(async (file) => {
      return connection.execute(
        `INSERT INTO images (column_id, file_path, field_name) 
         VALUES (:column_id, :file_path, :field)`,
        { 
          column_id: column_id,
          file_path: file.filename, 
          field: field
        }
      );
    });

    await Promise.all(insertPromises);
    await connection.commit();

    const newImagesResult = await connection.execute(
      `SELECT file_path FROM images WHERE column_id = :column_id AND field_name = :field`,
      { column_id, field }
    );
    
    const images = newImagesResult.rows.map(row => row[0]);

    res.json({ 
      message: 'Tải lên hình ảnh thành công',
      images: images
    });


  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

// API lấy danh sách hình ảnh từ database
router.get('/get-images/:column_id/:field', async (req, res) => {
  const { column_id, field } = req.params;
  let connection;

  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT file_path FROM images WHERE column_id = :column_id AND field_name = :field`,
      { column_id, field }
    );
    const images = result.rows ? result.rows.map(row => row[0]) : [];    
    res.json({ images });

  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

// Sửa lại API lấy danh sách
router.get('/list', async (req, res) => {
    let connection;
    try {
        connection = await database.getConnection();
        const result = await connection.execute(
            `SELECT 
                column_id, stt, ma, khach_hang, ma_tai_lieu,doi_tuong, rev, 
                cong_venh, v_cut, xu_ly_be_mat, ghi_chu,
                created_by, TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI:SS') as created_at,
                is_deleted, deleted_by,
                TO_CHAR(deleted_at, 'DD/MM/YYYY HH24:MI:SS') as deleted_at,
                restored_by, TO_CHAR(restored_at, 'DD/MM/YYYY HH24:MI:SS') as restored_at
            FROM document_columns 
            ORDER BY stt ASC`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        // Xử lý dữ liệu GHI_CHU trước khi trả về
        const processedRows = result.rows.map(row => {
            const processedRow = { ...row };
            if (processedRow.GHI_CHU === null || processedRow.GHI_CHU === undefined) {
                processedRow.GHI_CHU = '';
            }
            else if (typeof processedRow.GHI_CHU === 'string') {
                if (processedRow.GHI_CHU.includes('_events') || 
                    processedRow.GHI_CHU.includes('_readableState')) {
                    processedRow.GHI_CHU = '';
                }
            }
            return processedRow;
        });
        
        res.json(processedRows);
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

// Thêm middleware để phục vụ thư mục uploads
router.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Thêm route để kiểm tra hình ảnh
router.get('/check-image/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, '../../uploads', filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

// API xóa hình ảnh
router.delete('/delete-image/:column_id/:field/:filename', async (req, res) => {
  const { column_id, field, filename } = req.params;
  let connection;

  try {
    // Xóa file từ hệ thống
    const filePath = path.join(__dirname, '../../uploads', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    // Xóa record từ database
    connection = await database.getConnection();
    await connection.execute(
      `DELETE FROM images WHERE column_id = :column_id AND field_name = :field AND file_path = :filename`,
      { column_id, field, filename }
    );
    await connection.commit();
    res.json({ message: 'Xóa hình ảnh thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi xóa hình ảnh', error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

// Add this route to get all images
router.get('/get-all-images', async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();
    const result = await connection.execute(
      `SELECT DISTINCT file_path FROM images`
    );
    
    const images = result.rows.map(row => row[0]);
    res.json({ images });
  } catch (err) {
    console.error('Error getting all images:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

// API lấy lịch sử chỉnh sửa của một ô
// Sửa route lấy lịch sử chỉnh sửa
router.get('/edit-history/:column_id/:field', async (req, res) => {
  const { column_id, field } = req.params;
  let connection;
  
  try {
    connection = await database.getConnection();
    
    // Lấy thông tin người tạo
    const creatorInfo = await connection.execute(
      `SELECT 
        created_by,
        TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI:SS') as created_at
       FROM document_columns 
       WHERE column_id = :column_id`,
      { column_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Lấy lịch sử chỉnh sửa
    const editHistory = await connection.execute(
      `SELECT 
        h.history_id,
        h.column_id,
        h.field_name,
        h.old_value,
        h.new_value,
        h.edited_by,
        TO_CHAR(h.edit_time, 'DD/MM/YYYY HH24:MI:SS') as edit_time
       FROM edit_history h
       WHERE h.column_id = :column_id 
       AND h.field_name = :field
       ORDER BY h.edit_time DESC`,
      { 
        column_id: column_id,
        field: field 
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    res.json({
      creator: creatorInfo.rows[0],
      history: editHistory.rows
    });
  } catch (err) {
    res.status(500).json({ 
      message: 'Lỗi khi lấy lịch sử chỉnh sửa',
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

router.put('/soft-delete/:column_id', async (req, res) => {
  const { column_id } = req.params;
  const { username } = req.body;
  let connection;

  try {
    connection = await database.getConnection();
    
    await connection.execute(
      `UPDATE document_columns 
       SET IS_DELETED = 1, 
           DELETED_BY = :username, 
           DELETED_AT = CURRENT_TIMESTAMP 
       WHERE COLUMN_ID = :column_id`,
      { column_id, username }
    );
    
    await connection.commit();
    res.json({ message: 'Đánh dấu xóa thành công' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi cập nhật trạng thái xóa' });
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

router.put('/restore/:column_id', async (req, res) => {
  const { column_id } = req.params;
  const { username } = req.body;
  let connection;

  try {
    connection = await database.getConnection();
    
    await connection.execute(
      `UPDATE document_columns 
       SET IS_DELETED = 0, 
           DELETED_BY = NULL, 
           DELETED_AT = NULL,
           RESTORED_BY = :username,
           RESTORED_AT = CURRENT_TIMESTAMP
       WHERE COLUMN_ID = :column_id`,
      { column_id, username }
    );
    
    await connection.commit();
    res.json({ message: 'Khôi phục dữ liệu thành công' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi khôi phục dữ liệu' });
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

// Thêm route xác nhận review
router.post('/confirm-review', async (req, res) => {
  const { column_id, review_type, reviewed_by } = req.body;
  let connection;

  try {
    connection = await database.getConnection();
    const existingRecord = await connection.execute(
      `SELECT id FROM review_status WHERE column_id = :column_id`,
      { column_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const reviewField = review_type.toLowerCase() === 'ci' ? 'ci' : 'design';

    if (existingRecord.rows.length === 0) {
      await connection.execute(
        `INSERT INTO review_status (
          id,
          column_id,
          rev_change_date,
          ${reviewField}_reviewed,
          ${reviewField}_reviewed_by,
          ${reviewField}_reviewed_at
        ) VALUES (
          review_status_seq.NEXTVAL,
          :column_id,
          CURRENT_TIMESTAMP,
          1,
          :reviewed_by,
          CURRENT_TIMESTAMP
        )`,
        { 
          column_id: Number(column_id),
          reviewed_by
        }
      );
    } else {
      await connection.execute(
        `UPDATE review_status SET
          ${reviewField}_reviewed = 1,
          ${reviewField}_reviewed_by = :reviewed_by,
          ${reviewField}_reviewed_at = CURRENT_TIMESTAMP
        WHERE column_id = :column_id`,
        { 
          column_id: Number(column_id),
          reviewed_by
        }
      );
    }

    await connection.commit();

    // Return the updated status
    const updatedStatus = await connection.execute(
      `SELECT 
        ci_reviewed,
        design_reviewed,
        ci_reviewed_by,
        design_reviewed_by,
        TO_CHAR(ci_reviewed_at, 'DD/MM/YYYY HH24:MI:SS') as ci_reviewed_at,
        TO_CHAR(design_reviewed_at, 'DD/MM/YYYY HH24:MI:SS') as design_reviewed_at,
        TO_CHAR(rev_change_date, 'DD/MM/YYYY HH24:MI:SS') as rev_change_date
      FROM review_status 
      WHERE column_id = :column_id`,
      { column_id: Number(column_id) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      message: 'Cập nhật trạng thái review thành công',
      status: updatedStatus.rows[0]
    });

  } catch (err) {
    console.error('Error in confirm-review:', err);
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
    }
    res.status(500).json({ 
      message: 'Lỗi khi cập nhật trạng thái review',
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

// Thêm route lấy trạng thái review
router.get('/review-status/:column_id', async (req, res) => {
  const { column_id } = req.params;
  let connection;

  try {
    connection = await database.getConnection();
    
    const result = await connection.execute(
      `SELECT 
        ci_reviewed,
        design_reviewed,
        ci_reviewed_by,
        design_reviewed_by,
        TO_CHAR(ci_reviewed_at, 'DD/MM/YYYY HH24:MI:SS') as ci_reviewed_at,
        TO_CHAR(design_reviewed_at, 'DD/MM/YYYY HH24:MI:SS') as design_reviewed_at,
        TO_CHAR(rev_change_date, 'DD/MM/YYYY HH24:MI:SS') as rev_change_date
      FROM review_status 
      WHERE column_id = :column_id`,
      { column_id: Number(column_id) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Đảm bảo luôn trả về một đối tượng có cấu trúc nhất quán
    const defaultStatus = {
      ci_reviewed: 0,
      design_reviewed: 0,
      ci_reviewed_by: null,
      design_reviewed_by: null,
      ci_reviewed_at: null,
      design_reviewed_at: null,
      rev_change_date: null
    };

    res.json(result.rows[0] || defaultStatus);

  } catch (err) {
    console.error('Error in review-status:', err);
    res.status(500).json({ 
      message: 'Lỗi khi lấy trạng thái review',
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

router.post('/reset-review-field', async (req, res) => {
  const { column_id, field } = req.body;
  let connection;

  try {
    connection = await database.getConnection();

    // Map fields to database columns
    const fieldMapping = {
      V_CUT: 'ci_reviewed',
      XU_LY_BE_MAT: 'ci_reviewed',
      CONG_VENH: 'design_reviewed'
    };

    const reviewedColumn = fieldMapping[field];
    const reviewedByColumn = `${reviewedColumn}_by`;
    const reviewedAtColumn = `${reviewedColumn}_at`;

    if (!reviewedColumn) {
      return res.status(400).json({ message: `Invalid field: ${field}` });
    }

    await connection.execute(
      `UPDATE review_status
       SET 
         ${reviewedColumn} = 0,
         ${reviewedByColumn} = NULL,
         ${reviewedAtColumn} = NULL
       WHERE column_id = :column_id`,
      { column_id }
    );

    await connection.commit();
    res.json({ message: `Trạng thái review cho trường ${field} đã được reset thành công` });
  } catch (err) {
    console.error('Error resetting review status for field:', err);
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
    }
    res.status(500).json({ 
      message: 'Lỗi khi reset trạng thái review cho trường',
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
