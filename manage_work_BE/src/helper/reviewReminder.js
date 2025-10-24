const database = require('../config/database');
const { sendMail, generateRemindReviewHTML } = require('./sendMailRemind');

// Danh sách email cho từng team
const DESIGN_TEAM_EMAILS = [
    'nam.nguyenhoang@meiko-elec.com',
    // 'hung.nguyencong@meiko-elec.com',
    // 'thuy.nguyen2@meiko-elec.com',
    // 'van.trinh@meiko-elec.com',
    // 'trung.khuatvan@meiko-elec.com',
    // 'huy.nguyendinh2@meiko-elec.com',
    // 'dao.ngominh@meiko-elec.com',
    // 'phu.mai@meiko-elec.com',
    // 'van.nguyenthanh@meiko-elec.com',
    // 'dung.dovan@meiko-elec.com',
    // 'hang.ngo@meiko-elec.com'
];

const CI_TEAM_EMAILS = [
    // 'hung.khuathuu@meiko-elec.com',
    // 'quyen.tavan@meiko-elec.com',
    // 'thuy.nguyen1@meiko-elec.com',
    // 'thoi.nguyen@meiko-elec.com',
    // 'khoi.lecong@meiko-elec.com',
    'trang.nguyenkieu@meiko-elec.com',
];

async function checkAndSendReviewReminders() {
    console.log('🔍 Starting checkAndSendReviewReminders...');
    let connection;
    try {
        connection = await database.getConnection();        
        
        // Query để lấy tất cả dữ liệu overdue
        const result = await connection.execute(
            `SELECT 
                dc.stt,
                dc.column_id,
                dc.ma,
                dc.khach_hang,
                dc.ma_tai_lieu,
                dc.ky_han,
                dc.cong_venh,
                dc.v_cut,
                dc.xu_ly_be_mat,
                dc.is_deleted,
                rs.ci_reviewed,
                rs.design_reviewed
            FROM document_columns dc
            LEFT JOIN review_status rs ON dc.column_id = rs.column_id
            WHERE 
                dc.ky_han < CURRENT_DATE
                AND (dc.is_deleted = 0 OR dc.is_deleted IS NULL)`
        ); 

        if (result.rows.length > 0) {
            // Tách dữ liệu thành 2 nhóm: Design và CI
            const designItems = [];
            const ciItems = [];

            result.rows.forEach(row => {
                const [stt, ma, khach_hang, ma_tai_lieu, ky_han, cong_venh, v_cut, xu_ly_be_mat, ci_reviewed, design_reviewed] = row;
                
                const baseItem = {
                    stt: stt,
                    ma: ma,
                    khach_hang: khach_hang,
                    ma_tai_lieu: ma_tai_lieu,
                    ky_han: ky_han
                };

                // Kiểm tra Design review 
                const designPendingReviews = [];
                
                // Trường hợp 1: Có dữ liệu cong_venh và cần review lại (=1)
                if (cong_venh !== null && design_reviewed === 1) {
                    designPendingReviews.push('Cong vênh');
                }
                // Trường hợp 2: Chưa có dữ liệu cong_venh nhưng cần review (=1)
                else if (cong_venh === null && design_reviewed === 1) {
                    designPendingReviews.push('Cong vênh');
                } else if (cong_venh === null) {
                    designPendingReviews.push('Cong vênh');
                }

                if (designPendingReviews.length > 0) {
                    designItems.push({
                        ...baseItem,
                        pendingReviews: designPendingReviews
                    });
                    console.log(`   🎨 Design review needed: ${ma} - ${designPendingReviews.join(', ')}`);
                }

                // Kiểm tra CI review
                const ciPendingReviews = [];
                
                if (ci_reviewed === 1 || ci_reviewed === 0) {
                    // Trường hợp 1: Có dữ liệu và cần review lại
                    if (v_cut !== null) {
                        ciPendingReviews.push('V-Cut');
                    }
                    if (xu_ly_be_mat !== null) {
                        ciPendingReviews.push('Xử lý bề mặt');
                    }
     
                    if (v_cut === null) {
                        ciPendingReviews.push('V-Cut');
                    }
                    if (xu_ly_be_mat === null) {
                        ciPendingReviews.push('Xử lý bề mặt');
                    }
                }

                if (ciPendingReviews.length > 0) {
                    ciItems.push({
                        ...baseItem,
                        pendingReviews: ciPendingReviews
                    });
                    console.log(`   🔧 CI review needed: ${ma} - ${ciPendingReviews.join(', ')}`);
                }
            });

            // Gửi email cho team Design nếu có items
            if (designItems.length > 0) {
                await sendMail(
                    'Nhắc nhở: Review thiết kế quá hạn',
                    generateRemindReviewHTML(designItems),
                    DESIGN_TEAM_EMAILS
                );
                console.log(`✅ Design reminder email sent successfully for ${designItems.length} overdue items`);
            }

            // Gửi email cho team CI nếu có items
            if (ciItems.length > 0) {
                await sendMail(
                    'Nhắc nhở: Review CI quá hạn',
                    generateRemindReviewHTML(ciItems),
                    CI_TEAM_EMAILS
                );
                console.log(`✅ CI reminder email sent successfully for ${ciItems.length} overdue items`);
            }

            if (designItems.length === 0 && ciItems.length === 0) {
                console.log('✅ No overdue reviews found');
            }

        } else {
            console.log('✅ No overdue items found that need review');
            
            // Debug: Kiểm tra tại sao không có items
            const debugResult = await connection.execute(
                `SELECT 
                    dc.column_id,
                    dc.ma,
                    TO_CHAR(dc.ky_han, 'DD/MM/YYYY') as ky_han_formatted,
                    CASE WHEN dc.ky_han < CURRENT_DATE THEN 'OVERDUE' ELSE 'NOT_OVERDUE' END as status,
                    dc.is_deleted,
                    CASE WHEN dc.cong_venh IS NOT NULL THEN 'HAS_CONG_VENH' ELSE 'NO_CONG_VENH' END as cong_venh_status,
                    CASE WHEN dc.v_cut IS NOT NULL THEN 'HAS_V_CUT' ELSE 'NO_V_CUT' END as v_cut_status,
                    CASE WHEN dc.xu_ly_be_mat IS NOT NULL THEN 'HAS_XU_LY' ELSE 'NO_XU_LY' END as xu_ly_status,
                    rs.ci_reviewed,
                    rs.design_reviewed
                FROM document_columns dc
                LEFT JOIN review_status rs ON dc.column_id = rs.column_id
                WHERE dc.ky_han < CURRENT_DATE
                AND (dc.is_deleted = 0 OR dc.is_deleted IS NULL)`
            );
            
            console.log(`   📋 Debug: Found ${debugResult.rows.length} total overdue records:`);
            debugResult.rows.forEach(row => {
                const [column_id, ma, ky_han_formatted, status, is_deleted, cong_venh_status, v_cut_status, xu_ly_status, ci_reviewed, design_reviewed] = row;
                console.log(`     ${ma}: ${ky_han_formatted} (${status})`);
                console.log(`       Fields: ${cong_venh_status}, ${v_cut_status}, ${xu_ly_status}`);
                console.log(`       Reviews: CI=${ci_reviewed}, DESIGN=${design_reviewed}`);
                
                const needsDesignReview = design_reviewed === 1;
                const needsCiReview = ci_reviewed === 1;
                
                console.log(`       Needs Design review: ${needsDesignReview ? 'YES' : 'NO'}`);
                console.log(`       Needs CI review: ${needsCiReview ? 'YES' : 'NO'}`);
            });
        }
    } catch (err) {
        console.error('❌ Error in checkAndSendReviewReminders:', err);
        console.error('Stack trace:', err.stack);
        throw err;
    } finally {
        if (connection) {
            try {
                await connection.close();
                console.log('🔒 Database connection closed');
            } catch (err) {
                console.error('❌ Error closing connection:', err);
            }
        }
    }
}

module.exports = { checkAndSendReviewReminders };