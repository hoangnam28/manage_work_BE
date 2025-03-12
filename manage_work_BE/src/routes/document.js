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

// Tạo thư mục uploads nếu chưa tồn tại
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Thêm dữ liệu vào bảng document_columns
router.post('/add', async (req, res) => {
    const { ma, khach_hang, ma_tai_lieu } = req.body;
    let connection;
    try {
        connection = await database.getConnection();
        // Get next sequence value for STT
        const seqResult = await connection.execute(
            `SELECT seq_document_columns.NEXTVAL as next_stt FROM DUAL`
        );
        const stt = seqResult.rows[0][0];

        const result = await connection.execute(
            `INSERT INTO document_columns (
                column_id, stt, ma, khach_hang, ma_tai_lieu
            ) VALUES (
                seq_document_columns.NEXTVAL, :stt, :ma, :khach_hang, :ma_tai_lieu
            )`,
            { 
                stt,
                ma, 
                khach_hang, 
                ma_tai_lieu
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
                ma_tai_lieu
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            message: 'Lỗi server', 
            error: err.message 
        });
    } finally {
        if (connection) await connection.close();
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
    console.log(`Uploading images for column_id: ${column_id}, field: ${field}`);
    console.log('Files:', req.files.map(f => f.filename));
    
    connection = await database.getConnection();

    // Chèn từng file vào database
    const insertPromises = req.files.map(async (file) => {
      return connection.execute(
        `INSERT INTO images (column_id, file_path, field_name) 
         VALUES (:column_id, :file_path, :field)`,
        { 
          column_id: column_id,
          file_path: file.filename, // Chỉ lưu tên file
          field: field
        }
      );
    });

    await Promise.all(insertPromises);
    await connection.commit();

    // Lấy danh sách hình ảnh mới sau khi thêm
    const newImagesResult = await connection.execute(
      `SELECT file_path FROM images WHERE column_id = :column_id AND field_name = :field`,
      { column_id, field }
    );
    
    const images = newImagesResult.rows.map(row => row[0]);
    console.log('Images after upload:', images);

    res.json({ 
      message: 'Tải lên hình ảnh thành công',
      images: images
    });

  } catch (err) {
    console.error('Error in upload-images:', err);
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
    
    // Log để debug
    console.log(`Fetching images for column_id: ${column_id}, field: ${field}`);
    
    const result = await connection.execute(
      `SELECT file_path FROM images WHERE column_id = :column_id AND field_name = :field`,
      { column_id, field }
    );

    // Log kết quả truy vấn
    console.log('Query result:', result);
    console.log('Number of rows:', result.rows ? result.rows.length : 0);
    
    // Đảm bảo result.rows là một mảng
    const images = result.rows ? result.rows.map(row => row[0]) : [];
    
    console.log('Returning images:', images);
    
    res.json({ images });

  } catch (err) {
    console.error('Error in get-images:', err);
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
            `SELECT column_id, stt, ma, khach_hang, ma_tai_lieu, rev, 
            phu_trach_thiet_ke, ngay_thiet_ke, cong_venh, phu_trach_review, 
            ngay, v_cut, xu_ly_be_mat, ghi_chu
            FROM document_columns 
            ORDER BY stt ASC`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        // Xử lý dữ liệu GHI_CHU trước khi trả về
        const processedRows = result.rows.map(row => {
            const processedRow = { ...row };
            
            // Xử lý trường GHI_CHU
            if (processedRow.GHI_CHU) {
                if (typeof processedRow.GHI_CHU === 'string') {
                    if (processedRow.GHI_CHU.includes('_events') || 
                        processedRow.GHI_CHU.includes('_readableState')) {
                        processedRow.GHI_CHU = '';
                    }
                }
            }
            
            return processedRow;
        });
        
        res.json(processedRows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server' });
    } finally {
        if (connection) await connection.close();
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
    console.error('Error deleting image:', err);
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

module.exports = router;
