const express = require('express');
const router = express.Router();
const database = require('../config/database');
const oracledb = require('oracledb');
const { authenticateToken } = require('../middleware/auth');

// ============================================
// BUSINESS OPERATION TEMPLATES
// ============================================

// Lấy tất cả Business Operation Templates
router.get('/business-templates', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await database.getConnection();
        
        const result = await connection.execute(
            `SELECT 
                ID, NAME, DESCRIPTION, CREATED_BY, CREATED_AT, 
                IS_ACTIVE, UPDATED_AT, UPDATED_BY
             FROM BUSINESS_OPERATION_TEMPLATES 
             WHERE IS_DELETED = 0
             ORDER BY CREATED_AT DESC`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching business templates:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách business templates',
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

// Tạo Business Operation Template mới
router.post('/business-templates', authenticateToken, async (req, res) => {
    const { name, description, isActive = 1 } = req.body;
    const userId = req.user.userId;
    let connection;

    if (!name || name.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Tên business template không được để trống'
        });
    }

    try {
        connection = await database.getConnection();

        const result = await connection.execute(
            `INSERT INTO BUSINESS_OPERATION_TEMPLATES 
             (NAME, DESCRIPTION, CREATED_BY, IS_ACTIVE, CREATED_AT) 
             VALUES (:name, :description, :createdBy, :isActive, CURRENT_TIMESTAMP)
             RETURNING ID INTO :id`,
            {
                name: name.trim(),
                description: description ? description.trim() : null,
                createdBy: userId,
                isActive: isActive,
                id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            },
            { autoCommit: true }
        );

        res.status(201).json({
            success: true,
            message: 'Tạo business template thành công',
            data: {
                id: result.outBinds.id[0],
                name: name.trim(),
                description: description
            }
        });
    } catch (error) {
        console.error('Error creating business template:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo business template',
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

// Cập nhật Business Operation Template
router.put('/business-templates/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, description, isActive } = req.body;
    const userId = req.user.userId;
    let connection;

    if (!name || name.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Tên business template không được để trống'
        });
    }

    try {
        connection = await database.getConnection();

        const result = await connection.execute(
            `UPDATE BUSINESS_OPERATION_TEMPLATES 
             SET NAME = :name,
                 DESCRIPTION = :description,
                 IS_ACTIVE = :isActive,
                 UPDATED_AT = CURRENT_TIMESTAMP,
                 UPDATED_BY = :updatedBy
             WHERE ID = :id AND IS_DELETED = 0`,
            {
                name: name.trim(),
                description: description ? description.trim() : null,
                isActive: isActive !== undefined ? isActive : 1,
                updatedBy: userId,
                id: id
            },
            { autoCommit: true }
        );

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy business template'
            });
        }

        res.json({
            success: true,
            message: 'Cập nhật business template thành công'
        });
    } catch (error) {
        console.error('Error updating business template:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật business template',
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

// Xóa Business Operation Template (soft delete)
router.delete('/business-templates/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    let connection;

    try {
        connection = await database.getConnection();

        const result = await connection.execute(
            `UPDATE BUSINESS_OPERATION_TEMPLATES 
             SET IS_DELETED = 1,
                 UPDATED_AT = CURRENT_TIMESTAMP,
                 UPDATED_BY = :updatedBy
             WHERE ID = :id`,
            {
                updatedBy: userId,
                id: id
            },
            { autoCommit: true }
        );

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy business template'
            });
        }

        res.json({
            success: true,
            message: 'Xóa business template thành công'
        });
    } catch (error) {
        console.error('Error deleting business template:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa business template',
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

// ============================================
// PROJECT TEMPLATES
// ============================================

// Lấy tất cả Project Templates theo Business Template
router.get('/project-templates/:boTemplateId', authenticateToken, async (req, res) => {
    const { boTemplateId } = req.params;
    let connection;

    try {
        connection = await database.getConnection();
        
        const result = await connection.execute(
            `SELECT 
                ID, BO_TEMPLATE_ID, NAME, CODE, DESCRIPTION, 
                CREATED_BY, CREATED_AT, IS_ACTIVE, UPDATED_AT, UPDATED_BY
             FROM PROJECT_TEMPLATES 
             WHERE BO_TEMPLATE_ID = :boTemplateId AND IS_DELETED = 0
             ORDER BY CREATED_AT DESC`,
            { boTemplateId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching project templates:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách project templates',
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

// Tạo Project Template mới
router.post('/project-templates', authenticateToken, async (req, res) => {
    const { boTemplateId, name, code, description, isActive = 1 } = req.body;
    const userId = req.user.userId;
    let connection;

    if (!boTemplateId || !name || name.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Business template ID và tên project không được để trống'
        });
    }

    try {
        connection = await database.getConnection();

        const result = await connection.execute(
            `INSERT INTO PROJECT_TEMPLATES 
             (BO_TEMPLATE_ID, NAME, CODE, DESCRIPTION, CREATED_BY, IS_ACTIVE, CREATED_AT) 
             VALUES (:boTemplateId, :name, :code, :description, :createdBy, :isActive, CURRENT_TIMESTAMP)
             RETURNING ID INTO :id`,
            {
                boTemplateId: boTemplateId,
                name: name.trim(),
                code: code ? code.trim() : null,
                description: description ? description.trim() : null,
                createdBy: userId,
                isActive: isActive,
                id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            },
            { autoCommit: true }
        );

        res.status(201).json({
            success: true,
            message: 'Tạo project template thành công',
            data: {
                id: result.outBinds.id[0],
                name: name.trim(),
                code: code
            }
        });
    } catch (error) {
        console.error('Error creating project template:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo project template',
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

// Cập nhật Project Template
router.put('/project-templates/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, code, description, isActive } = req.body;
    const userId = req.user.userId;
    let connection;

    if (!name || name.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Tên project template không được để trống'
        });
    }

    try {
        connection = await database.getConnection();

        const result = await connection.execute(
            `UPDATE PROJECT_TEMPLATES 
             SET NAME = :name,
                 CODE = :code,
                 DESCRIPTION = :description,
                 IS_ACTIVE = :isActive,
                 UPDATED_AT = CURRENT_TIMESTAMP,
                 UPDATED_BY = :updatedBy
             WHERE ID = :id AND IS_DELETED = 0`,
            {
                name: name.trim(),
                code: code ? code.trim() : null,
                description: description ? description.trim() : null,
                isActive: isActive !== undefined ? isActive : 1,
                updatedBy: userId,
                id: id
            },
            { autoCommit: true }
        );

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy project template'
            });
        }

        res.json({
            success: true,
            message: 'Cập nhật project template thành công'
        });
    } catch (error) {
        console.error('Error updating project template:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật project template',
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

// Xóa Project Template (soft delete)
router.delete('/project-templates/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    let connection;

    try {
        connection = await database.getConnection();

        const result = await connection.execute(
            `UPDATE PROJECT_TEMPLATES 
             SET IS_DELETED = 1,
                 UPDATED_AT = CURRENT_TIMESTAMP,
                 UPDATED_BY = :updatedBy
             WHERE ID = :id`,
            {
                updatedBy: userId,
                id: id
            },
            { autoCommit: true }
        );

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy project template'
            });
        }

        res.json({
            success: true,
            message: 'Xóa project template thành công'
        });
    } catch (error) {
        console.error('Error deleting project template:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa project template',
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

// ============================================
// TASK TEMPLATES
// ============================================

// Lấy tất cả Task Templates theo Project Template
router.get('/task-templates/:projectTemplateId', authenticateToken, async (req, res) => {
    const { projectTemplateId } = req.params;
    let connection;

    try {
        connection = await database.getConnection();
        
        const result = await connection.execute(
            `SELECT 
                ID, PROJECT_TEMPLATE_ID, NAME, DESCRIPTION, 
                ESTIMATED_DURATION, PRIORITY, CREATED_BY, CREATED_AT, 
                IS_ACTIVE, UPDATED_AT, UPDATED_BY
             FROM TASK_TEMPLATES 
             WHERE PROJECT_TEMPLATE_ID = :projectTemplateId AND IS_DELETED = 0
             ORDER BY CREATED_AT DESC`,
            { projectTemplateId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching task templates:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách task templates',
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

// Tạo Task Template mới
router.post('/task-templates', authenticateToken, async (req, res) => {
    const { projectTemplateId, name, description, estimatedDuration, priority, isActive = 1 } = req.body;
    const userId = req.user.userId;
    let connection;

    if (!projectTemplateId || !name || name.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Project template ID và tên task không được để trống'
        });
    }

    try {
        connection = await database.getConnection();

        const result = await connection.execute(
            `INSERT INTO TASK_TEMPLATES 
             (PROJECT_TEMPLATE_ID, NAME, DESCRIPTION, ESTIMATED_DURATION, 
              PRIORITY, CREATED_BY, IS_ACTIVE, CREATED_AT) 
             VALUES (:projectTemplateId, :name, :description, :estimatedDuration, 
                     :priority, :createdBy, :isActive, CURRENT_TIMESTAMP)
             RETURNING ID INTO :id`,
            {
                projectTemplateId: projectTemplateId,
                name: name.trim(),
                description: description ? description.trim() : null,
                estimatedDuration: estimatedDuration || null,
                priority: priority || 'MEDIUM',
                createdBy: userId,
                isActive: isActive,
                id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            },
            { autoCommit: true }
        );

        res.status(201).json({
            success: true,
            message: 'Tạo task template thành công',
            data: {
                id: result.outBinds.id[0],
                name: name.trim(),
                priority: priority || 'MEDIUM'
            }
        });
    } catch (error) {
        console.error('Error creating task template:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo task template',
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

// Cập nhật Task Template
router.put('/task-templates/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, description, estimatedDuration, priority, isActive } = req.body;
    const userId = req.user.userId;
    let connection;

    if (!name || name.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Tên task template không được để trống'
        });
    }

    try {
        connection = await database.getConnection();

        const result = await connection.execute(
            `UPDATE TASK_TEMPLATES 
             SET NAME = :name,
                 DESCRIPTION = :description,
                 ESTIMATED_DURATION = :estimatedDuration,
                 PRIORITY = :priority,
                 IS_ACTIVE = :isActive,
                 UPDATED_AT = CURRENT_TIMESTAMP,
                 UPDATED_BY = :updatedBy
             WHERE ID = :id AND IS_DELETED = 0`,
            {
                name: name.trim(),
                description: description ? description.trim() : null,
                estimatedDuration: estimatedDuration || null,
                priority: priority || 'MEDIUM',
                isActive: isActive !== undefined ? isActive : 1,
                updatedBy: userId,
                id: id
            },
            { autoCommit: true }
        );

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy task template'
            });
        }

        res.json({
            success: true,
            message: 'Cập nhật task template thành công'
        });
    } catch (error) {
        console.error('Error updating task template:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật task template',
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

// Xóa Task Template (soft delete)
router.delete('/task-templates/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    let connection;

    try {
        connection = await database.getConnection();

        const result = await connection.execute(
            `UPDATE TASK_TEMPLATES 
             SET IS_DELETED = 1,
                 UPDATED_AT = CURRENT_TIMESTAMP,
                 UPDATED_BY = :updatedBy
             WHERE ID = :id`,
            {
                updatedBy: userId,
                id: id
            },
            { autoCommit: true }
        );

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy task template'
            });
        }

        res.json({
            success: true,
            message: 'Xóa task template thành công'
        });
    } catch (error) {
        console.error('Error deleting task template:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa task template',
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

// ============================================
// UTILITY ENDPOINTS
// ============================================

// Lấy toàn bộ cấu trúc template (Business -> Projects -> Tasks)
router.get('/templates-hierarchy/:boTemplateId', authenticateToken, async (req, res) => {
    const { boTemplateId } = req.params;
    let connection;

    try {
        connection = await database.getConnection();
        
        // Lấy Business Template
        const businessResult = await connection.execute(
            `SELECT ID, NAME, DESCRIPTION 
             FROM BUSINESS_OPERATION_TEMPLATES 
             WHERE ID = :boTemplateId AND IS_DELETED = 0`,
            { boTemplateId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (businessResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy business template'
            });
        }

        // Lấy Project Templates
        const projectsResult = await connection.execute(
            `SELECT ID, NAME, CODE, DESCRIPTION 
             FROM PROJECT_TEMPLATES 
             WHERE BO_TEMPLATE_ID = :boTemplateId AND IS_DELETED = 0
             ORDER BY CREATED_AT`,
            { boTemplateId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Lấy Task Templates cho tất cả projects
        const projects = [];
        for (const project of projectsResult.rows) {
            const tasksResult = await connection.execute(
                `SELECT ID, NAME, DESCRIPTION, ESTIMATED_DURATION, PRIORITY 
                 FROM TASK_TEMPLATES 
                 WHERE PROJECT_TEMPLATE_ID = :projectId AND IS_DELETED = 0
                 ORDER BY CREATED_AT`,
                { projectId: project.ID },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            projects.push({
                ...project,
                tasks: tasksResult.rows
            });
        }

        res.json({
            success: true,
            data: {
                ...businessResult.rows[0],
                projects: projects
            }
        });
    } catch (error) {
        console.error('Error fetching templates hierarchy:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy cấu trúc templates',
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
// ============================================
// ENDPOINTS ĐỂ SỬ DỤNG TEMPLATES KHI TẠO MỚI
// ============================================

// Lấy active Business Templates cho dropdown
router.get('/business-templates/active', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await database.getConnection();
        
        const result = await connection.execute(
            `SELECT ID, NAME, DESCRIPTION
             FROM BUSINESS_OPERATION_TEMPLATES 
             WHERE IS_DELETED = 0 AND IS_ACTIVE = 1
             ORDER BY NAME`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching active business templates:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách business templates',
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

// Lấy active Project Templates theo Business Template cho dropdown
router.get('/project-templates/active/:boTemplateId', authenticateToken, async (req, res) => {
    const { boTemplateId } = req.params;
    let connection;

    try {
        connection = await database.getConnection();
        
        const result = await connection.execute(
            `SELECT ID, NAME, CODE, DESCRIPTION
             FROM PROJECT_TEMPLATES 
             WHERE BO_TEMPLATE_ID = :boTemplateId 
               AND IS_DELETED = 0 
               AND IS_ACTIVE = 1
             ORDER BY NAME`,
            { boTemplateId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching active project templates:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách project templates',
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

// Lấy active Task Templates theo Project Template cho dropdown
router.get('/task-templates/active/:projectTemplateId', authenticateToken, async (req, res) => {
    const { projectTemplateId } = req.params;
    let connection;

    try {
        connection = await database.getConnection();
        
        const result = await connection.execute(
            `SELECT ID, NAME, DESCRIPTION, ESTIMATED_DURATION, PRIORITY
             FROM TASK_TEMPLATES 
             WHERE PROJECT_TEMPLATE_ID = :projectTemplateId 
               AND IS_DELETED = 0 
               AND IS_ACTIVE = 1
             ORDER BY NAME`,
            { projectTemplateId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching active task templates:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách task templates',
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

// Lấy chi tiết template để auto-fill form
router.get('/business-templates/:id/details', authenticateToken, async (req, res) => {
    const { id } = req.params;
    let connection;

    try {
        connection = await database.getConnection();
        
        const result = await connection.execute(
            `SELECT NAME, DESCRIPTION
             FROM BUSINESS_OPERATION_TEMPLATES 
             WHERE ID = :id AND IS_DELETED = 0`,
            { id },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template không tồn tại'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching template details:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy chi tiết template',
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

module.exports = router;