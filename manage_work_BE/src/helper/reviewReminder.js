const database = require('../config/database');
const { sendMail } = require('./sendMailRemind');

async function checkAndSendReviewReminders() {
    let connection;
    try {
        connection = await database.getConnection();
        
        // Lấy các mục quá hạn và chưa được review
        const result = await connection.execute(
            `SELECT 
                dc.column_id,
                dc.ma,
                dc.khach_hang,
                dc.ma_tai_lieu,
                dc.ky_han,
                dc.cong_venh,
                dc.v_cut,
                dc.xu_ly_be_mat,
                rs.ci_reviewed,
                rs.design_reviewed
            FROM document_columns dc
            LEFT JOIN review_status rs ON dc.column_id = rs.column_id
            WHERE 
                dc.ky_han < CURRENT_DATE
                AND dc.is_deleted != 1
                AND (
                    (dc.cong_venh IS NOT NULL AND (rs.design_reviewed = 0 OR rs.design_reviewed IS NULL))
                    OR
                    (dc.v_cut IS NOT NULL AND (rs.ci_reviewed = 0 OR rs.ci_reviewed IS NULL))
                    OR
                    (dc.xu_ly_be_mat IS NOT NULL AND (rs.ci_reviewed = 0 OR rs.ci_reviewed IS NULL))
                )`,
            {},
            { outFormat: database.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length > 0) {
            const items = result.rows.map(row => {
                const pendingReviews = [];
                if (row.CONG_VENH && (!row.DESIGN_REVIEWED)) {
                    pendingReviews.push('Thiết kế Review (Cong vênh)');
                }
                if ((row.V_CUT || row.XU_LY_BE_MAT) && (!row.CI_REVIEWED)) {
                    pendingReviews.push('CI Review (V-Cut/Xử lý bề mặt)');
                }

                return {
                    ma: row.MA,
                    khach_hang: row.KHACH_HANG,
                    ma_tai_lieu: row.MA_TAI_LIEU,
                    ky_han: row.KY_HAN,
                    pendingReviews
                };
            });

            // Gửi email nhắc nhở
            await sendMail(
                'Nhắc nhở: Review tasks quá hạn',
                generateRemindReviewHTML(items),
                null // Sử dụng danh sách email mặc định
            );
            console.log(`Đã gửi mail nhắc nhở cho ${items.length} mục quá hạn`);
        }
    } catch (err) {
        console.error('Lỗi khi kiểm tra và gửi mail nhắc nhở:', err);
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Lỗi khi đóng kết nối:', err);
            }
        }
    }
}

module.exports = { checkAndSendReviewReminders };
