const nodemailer = require('nodemailer');

async function sendMailMaterialPP(subject, html, toList) {
    const transporter = nodemailer.createTransport({
        host: '10.27.100.181',
        port: 25,
        secure: false,
        tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
        from: 'mkvc_material_system@meiko-elec.com',
        to: Array.isArray(toList) && toList.length > 0 ? toList : [
            'thanh.vutien@meiko-elec.com',
            'nam.nguyenhoang@meiko-elec.com',
            'trang.nguyenkieu@meiko-elec.com'
        ],
        subject,
        html,
        priority: 'normal'
    };

    // Sửa lỗi: từ sendMailMaterial thành sendMail
    transporter.sendMail(mailOptions);
}

// Hàm tạo nội dung HTML cho email tạo mới 
function generateCreateMaterialEmailHTML(materialData, createdRecords) {
    // ✅ Xác định tiêu đề dựa trên trạng thái
    const getStatusTitle = (status) => {
        switch (status) {
            case 'Pending':
                return '📝 Yêu cầu cập nhật Material PP';
            case 'Approve':
                return '✅ Đã cập nhật Material PP';
            case 'Cancel':
                return '❌ Hủy yêu cầu Material PP';
            default:
                return '🆕 Thông báo tạo mới Material PP';
        }
    };

    const recordsHTML = createdRecords.map((record, index) => `
        <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${record.vendor || 'N/A'}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${record.family || 'N/A'}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${record.glass_style || 'N/A'}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${record.resin_percentage || 'N/A'}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${record.pp_type || 'N/A'}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${record.dk_01g || 'N/A'}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${record.df_01g || 'N/A'}</td>
        </tr>
        </tr>
    `).join('');

    return `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
            <h2 style="color: #2c5aa0; border-bottom: 2px solid #2c5aa0; padding-bottom: 10px;">
                ${getStatusTitle(materialData.status)}
            </h2>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h3 style="color: #333; margin-top: 0;">Thông tin chung:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold; width: 200px;">Người yêu cầu:</td>
                        <td>${materialData.name || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Ngày yêu cầu:</td>
                        <td>${materialData.request_date ? new Date(materialData.request_date).toLocaleDateString('vi-VN') : 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Trạng thái:</td>
                        <td><span style="background-color: ${materialData.status === 'Approve' ? '#28a745' : materialData.status === 'Cancel' ? '#dc3545' : '#ffc107'}; color: ${materialData.status === 'Pending' ? '#212529' : 'white'}; padding: 3px 8px; border-radius: 3px; font-size: 12px;">${materialData.status === 'Approve' ? 'Đã cập nhật' : materialData.status === 'Cancel' ? 'Hủy cập nhật' : 'Yêu cầu cập nhật'}</span></td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Vendor:</td>
                        <td>${materialData.vendor || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Family:</td>
                        <td>${materialData.family || 'N/A'}</td>
                    </tr>
                </table>
            </div>

            <div style="margin: 20px 0;">
                <h3 style="color: #333;">Chi tiết vật liệu được tạo (${createdRecords.length} bản ghi):</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background-color: #2c5aa0; color: white;">
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Vendor</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Family</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Glass Style</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Resin Percentage</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">PP Type</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">DK 01G</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">DF 01G</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recordsHTML}
                    </tbody>
                </table>
            </div>

            <div style="background-color: #e9ecef; padding: 15px; border-radius: 5px; margin-top: 20px;">
                <p style="margin: 0; font-size: 14px; color: #6c757d;">
                    <strong>Lưu ý:</strong> Đây là email thông báo tự động từ hệ thống Material Management System.
                    Vui lòng không trả lời email này.
                </p>
            </div>
        </div>
    `;
}

// Hàm tạo nội dung HTML cho email cập nhật trạng thái
function generateStatusUpdateEmailHTML(materialId, oldStatus, newStatus, updatedBy, materialInfo = {}) {
    // ✅ Xác định tiêu đề và icon dựa trên trạng thái mới
    const getStatusInfo = (status) => {
        switch (status) {
            case 'Pending':
                return {
                    title: '📝 Yêu cầu cập nhật Material PP',
                    color: '#ffc107',
                    icon: '📝'
                };
            case 'Approve':
                return {
                    title: '✅ Đã cập nhật Material PP',
                    color: '#28a745',
                    icon: '✅'
                };
            case 'Cancel':
                return {
                    title: '❌ Hủy yêu cầu Material PP',
                    color: '#dc3545',
                    icon: '❌'
                };
            default:
                return {
                    title: '⏳ Cập nhật trạng thái Material PP',
                    color: '#6c757d',
                    icon: '⏳'
                };
        }
    };

    const statusInfo = getStatusInfo(newStatus);

    return `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
            <h2 style="color: #2c5aa0; border-bottom: 2px solid #2c5aa0; padding-bottom: 10px;">
                ${statusInfo.title}
            </h2>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h3 style="color: #333; margin-top: 0;">Thông tin cập nhật:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold; width: 200px;">Material ID:</td>
                        <td><strong style="color: #2c5aa0;">#${materialId}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Trạng thái mới:</td>
                        <td><span style="background-color: ${statusInfo.color}; color: ${newStatus === 'Pending' ? '#212529' : 'white'}; padding: 3px 8px; border-radius: 3px; font-size: 12px;">${newStatus === 'Approve' ? 'Đã cập nhật' : newStatus === 'Cancel' ? 'Hủy cập nhật' : 'Yêu cầu cập nhật'}</span></td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Cập nhật bởi:</td>
                        <td>${updatedBy}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Thời gian:</td>
                        <td>${new Date().toLocaleString('vi-VN')}</td>
                    </tr>
                </table>
            </div>

            ${materialInfo.vendor || materialInfo.family ? `
            <div style="background-color: #fff; border: 1px solid #dee2e6; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h3 style="color: #333; margin-top: 0;">Thông tin Material:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    ${materialInfo.vendor ? `
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold; width: 200px;">Vendor:</td>
                        <td>${materialInfo.vendor}</td>
                    </tr>
                    ` : ''}
                    ${materialInfo.family ? `
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Family:</td>
                        <td>${materialInfo.family}</td>
                    </tr>
                    ` : ''}
                    ${materialInfo.requester_name ? `
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Người yêu cầu:</td>
                        <td>${materialInfo.name}</td>
                    </tr>
                    ` : ''}
                </table>
            </div>
            ` : ''}

            <div style="background-color: #e9ecef; padding: 15px; border-radius: 5px; margin-top: 20px;">
                <p style="margin: 0; font-size: 14px; color: #6c757d;">
                    <strong>Lưu ý:</strong> Đây là email thông báo tự động từ hệ thống Material Management System.
                    Vui lòng không trả lời email này.
                </p>
            </div>
        </div>
    `;
}
function generateMaterialChangeEmailHTML(materialId, changes, updatedBy, materialInfo = {}) {
    const changesHTML = changes.map(change => `
        <tr>
            <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; background-color: #f8f9fa;">${change.field}</td>
            <td style="border: 1px solid #ddd; padding: 8px; color: #dc3545;">${change.oldValue}</td>
            <td style="border: 1px solid #ddd; padding: 8px; color: #28a745; font-weight: bold;">${change.newValue}</td>
        </tr>
    `).join('');

    return `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
            <h2 style="color: #dc3545; border-bottom: 2px solid #dc3545; padding-bottom: 10px;">
                ⚠️ Cảnh báo: Thay đổi dữ liệu Material Core đã được Approve
            </h2>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h3 style="color: #856404; margin-top: 0;">🚨 Thông báo quan trọng:</h3>
                <p style="color: #856404; margin-bottom: 10px;">
                    Material Core ID <strong>#${materialId}</strong> đã được approve trước đó, nhưng vừa có thay đổi dữ liệu.
                    Điều này có thể ảnh hưởng đến các quy trình đã sử dụng material này.
                </p>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h3 style="color: #333; margin-top: 0;">Thông tin cập nhật:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold; width: 200px;">Material ID:</td>
                        <td><strong style="color: #2c5aa0;">#${materialId}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Trạng thái hiện tại:</td>
                        <td><span style="background-color: #28a745; color: white; padding: 3px 8px; border-radius: 3px; font-size: 12px;">Approve</span></td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Cập nhật bởi:</td>
                        <td>${updatedBy}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Thời gian thay đổi:</td>
                        <td>${new Date().toLocaleString('vi-VN')}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Số thay đổi:</td>
                        <td><strong style="color: #dc3545;">${changes.length} trường dữ liệu</strong></td>
                    </tr>
                </table>
            </div>

            ${materialInfo.vendor || materialInfo.family ? `
            <div style="background-color: #fff; border: 1px solid #dee2e6; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h3 style="color: #333; margin-top: 0;">Thông tin Material:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    ${materialInfo.vendor ? `
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold; width: 200px;">Vendor:</td>
                        <td>${materialInfo.vendor}</td>
                    </tr>
                    ` : ''}
                    ${materialInfo.family ? `
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Family:</td>
                        <td>${materialInfo.family}</td>
                    </tr>
                    ` : ''}
                    ${materialInfo.name ? `
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Người yêu cầu:</td>
                        <td>${materialInfo.name}</td>
                    </tr>
                    ` : ''}
                </table>
            </div>
            ` : ''}

            <div style="margin: 20px 0;">
                <h3 style="color: #dc3545;">📋 Chi tiết thay đổi:</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background-color: #dc3545; color: white;">
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 25%;">Trường dữ liệu</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 37.5%;">Giá trị cũ</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 37.5%;">Giá trị mới</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${changesHTML}
                    </tbody>
                </table>
            </div>

            <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h4 style="color: #721c24; margin-top: 0;">⚠️ Hành động được khuyến nghị:</h4>
                <ul style="color: #721c24; margin-bottom: 0;">
                    <li>Kiểm tra lại tính chính xác của các thay đổi</li>
                    <li>Thông báo cho các bộ phận liên quan đang sử dụng material này</li>
                    <li>Cập nhật các tài liệu kỹ thuật nếu cần thiết</li>
                    <li>Xem xét tác động đến các dự án đang thực hiện</li>
                </ul>
            </div>

            <div style="background-color: #e9ecef; padding: 15px; border-radius: 5px; margin-top: 20px;">
                <p style="margin: 0; font-size: 14px; color: #6c757d;">
                    <strong>Lưu ý:</strong> Đây là email cảnh báo tự động từ hệ thống Material Management System.
                    Vui lòng kiểm tra và xác nhận các thay đổi này. Không trả lời email này.
                </p>
            </div>
        </div>
    `;
}

module.exports = {
    sendMailMaterialPP,
    generateCreateMaterialEmailHTML,
    generateStatusUpdateEmailHTML,
    generateMaterialChangeEmailHTML
};