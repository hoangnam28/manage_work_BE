const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const database = require('../config/database');
require('dotenv').config();

// Cấu hình lưu trữ file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// API: Upload tài liệu Excel
router.post('/upload', async (req, res) => {
    const { file_name, uploaded_by } = req.body;
    let connection;
    try {
        connection = await database.getConnection();
        const result = await connection.execute(
            `INSERT INTO documents (file_name, uploaded_by) VALUES (:file_name, :uploaded_by) RETURNING document_id INTO :id`,
            { file_name, uploaded_by, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
            { autoCommit: true }
        );
        res.json({ message: 'Tài liệu đã được tải lên', document_id: result.outBinds.id[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server' });
    } finally {
        if (connection) await connection.close();
    }
});

// API: Upload hình ảnh
router.post('/upload-image', upload.single('image'), async (req, res) => {
    const { document_id, row_id, uploaded_by } = req.body;
    const filePath = req.file.path;
    let connection;
    try {
        connection = await database.getConnection();
        await connection.execute(
            `INSERT INTO images (document_id, row_id, file_path, uploaded_by) VALUES (:document_id, :row_id, :file_path, :uploaded_by)`,
            { document_id, row_id, file_path, uploaded_by },
            { autoCommit: true }
        );
        res.json({ message: 'Ảnh đã được tải lên', filePath });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server' });
    } finally {
        if (connection) await connection.close();
    }
});

// API: Cập nhật nội dung và lưu lịch sử chỉnh sửa
router.post('/edit-row', async (req, res) => {
    const { row_id, document_id, edited_by, new_content } = req.body;
    let connection;
    try {
        connection = await database.getConnection();
        const result = await connection.execute(
            `SELECT content FROM document_rows WHERE row_id = :row_id`,
            { row_id },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Dòng không tồn tại' });
        }
        const old_content = result.rows[0].CONTENT;

        await connection.execute(
            `INSERT INTO edit_history (document_id, row_id, edited_by, old_content, new_content) VALUES (:document_id, :row_id, :edited_by, :old_content, :new_content)`,
            { document_id, row_id, edited_by, old_content, new_content },
            { autoCommit: true }
        );

        await connection.execute(
            `UPDATE document_rows SET content = :new_content WHERE row_id = :row_id`,
            { new_content, row_id },
            { autoCommit: true }
        );

        res.json({ message: 'Dữ liệu đã được cập nhật' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server' });
    } finally {
        if (connection) await connection.close();
    }
});

// API: Lấy lịch sử chỉnh sửa
router.get('/edit-history/:document_id', async (req, res) => {
    const { document_id } = req.params;
    let connection;
    try {
        connection = await database.getConnection();
        const result = await connection.execute(
            `SELECT * FROM edit_history WHERE document_id = :document_id ORDER BY edit_time DESC`,
            { document_id },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server' });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;
