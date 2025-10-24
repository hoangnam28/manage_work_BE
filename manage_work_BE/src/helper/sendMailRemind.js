const nodemailer = require('nodemailer');
const moment = require('moment-timezone'); 

function generateNewReviewHTML(data) {
  return `
  <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px;">
    <div style="max-width: 650px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #1890ff, #40a9ff); padding: 16px 24px; color: #131010ff;">
        <h2 style="margin: 0;">🔔 Thông báo Review Cong Vênh, V-Cut, Xử lý bề mặt</h2>
      </div>

      <!-- Body -->
      <div style="padding: 24px; color: #333;">
        <p style="font-size: 15px;">Một yêu cầu review mới đã được tạo với thông tin sau:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <tbody>
            <tr>
              <td style="padding: 8px; font-weight: bold; width: 150px;">Mã:</td>
              <td style="padding: 8px; background: #fafafa;">${data.ma}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Khách hàng:</td>
              <td style="padding: 8px; background: #fafafa;">${data.khach_hang}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Mã tài liệu:</td>
              <td style="padding: 8px; background: #fafafa;">${data.ma_tai_lieu}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Kỳ hạn review:</td>
              <td style="padding: 8px; background: #fafafa;">${item.ky_han ? moment(item.ky_han).tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY') : ''}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Người tạo:</td>
              <td style="padding: 8px; background: #fafafa;">${data.created_by}</td>
            </tr>
          </tbody>
        </table>

        <p style="margin-top: 20px; font-size: 15px; color: #444;">
          Vui lòng kiểm tra và thực hiện review trước kỳ hạn.
        </p>
          <p style="margin-top: 20px; font-size: 15px; color: red; text-decoration: underline;">
          Nếu bạn không có yêu cầu xin vui lòng nhập "Không có yêu cầu" vào mục review, xin đừng bỏ trống không nhập dữ liệu. 
        </p>

        <!-- CTA -->
        <div style="margin-top: 20px; text-align: center;">
          <a href="http://192.84.105.173:8888/review_tasks?stt=${encodeURIComponent(data.stt)}" 
             style="background: #1890ff; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: bold;">
            Xem chi tiết
          </a> 
        </div>
      </div>

      <!-- Footer -->
      <div style="background: #f0f0f0; padding: 12px 24px; font-size: 12px; color: #666; text-align: center;">
        Đây là email tự động từ hệ thống Review Tài liệu Cong Vênh, V-Cut, Xử lý bề mặt. Vui lòng không trả lời lại.
      </div>
    </div>
  </div>
  `;
}

function generateUpdateDeadlineHTML(data) {
  return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ff4d4f;">Thông báo cập nhật kỳ hạn Review</h2>
            <p>Kỳ hạn review đã được cập nhật cho task sau:</p>
            <ul style="list-style: none; padding: 0;">
                <li><strong>Mã:</strong> ${data.ma}</li>
                <li><strong>Khách hàng:</strong> ${data.khach_hang}</li>
                <li><strong>Mã tài liệu:</strong> ${data.ma_tai_lieu}</li>
                <li><strong>Kỳ hạn cũ:</strong> ${moment(data.old_ky_han).tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY')}</li>
                <li><strong>Kỳ hạn mới:</strong> ${moment(data.new_ky_han).tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY')}</li>
                <li><strong>Người cập nhật:</strong> ${data.edited_by}</li>
            </ul>
            <p>Vui lòng lưu ý thay đổi này và thực hiện review theo kỳ hạn mới.</p>
        </div>
    `;
}

// FIX: Sửa lỗi biến không tồn tại
function generateRemindReviewHTML(items) {
  return `
  <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px;">
    <div style="max-width: 800px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #ff4d4f, #ff7875); padding: 16px 24px; color: #140101ff;">
        <h2 style="margin: 0;">⚠️ Nhắc nhở: Review quá hạn</h2>
      </div>

      <!-- Body -->
      <div style="padding: 24px; color: #333;">
        <p style="font-size: 15px; margin-bottom: 16px;">
          Các mục sau đã quá kỳ hạn review và chưa được xử lý:
        </p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #f5f5f5;">
              <th style="border: 1px solid #ddd; padding: 8px;">Mã</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Khách hàng</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Mã tài liệu</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Kỳ hạn review</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Cần review</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${item.ma}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${item.khach_hang}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${item.ma_tai_lieu}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${moment(item.ky_han).tz("Asia/Ho_Chi_Minh").format('DD/MM/YYYY')}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${item.pendingReviews.join(', ')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <p style="margin-top: 20px; font-size: 15px; color: #444;">
          Vui lòng kiểm tra và thực hiện review cho các mục trên.
        </p>
        <p style="margin-top: 20px; font-size: 15px; color: red; text-decoration: underline;">
          Nếu tài liệu khách hàng không có nội dung liên quan, hãy nhập "Không có yêu cầu" lên hệ thống.
        </p>

        <!-- CTA buttons -->
        <div style="margin-top: 20px; text-align: center;">
          ${items.map(item => `
            <a href="http://192.84.105.173:8888/review_tasks?stt=${encodeURIComponent(item.stt)}"
               style="display: inline-block; margin: 5px;
                      background: #1890ff; color: #fff; text-decoration: none;
                      padding: 8px 14px; border-radius: 4px; font-weight: bold; font-size: 13px;">
              Xem chi tiết - ${item.ma}
            </a>
          `).join('')}
        </div>
      </div>

      <!-- Footer -->
      <div style="background: #f0f0f0; padding: 12px 24px; font-size: 12px; color: #666; text-align: center;">
        Đây là email tự động từ hệ thống Review Tài liệu. Vui lòng không trả lời lại.
      </div>
    </div>
  </div>
  `;
}


async function sendMail(subject, html, toList) {
  const transporter = nodemailer.createTransport({
    host: '10.27.100.181',
    port: 25,
    secure: false,
    tls: { rejectUnauthorized: false }
  });

  const mailOptions = {
    from: '(CI-TK Review)mkvc.review_system@meiko-elec.com',
    to: Array.isArray(toList) && toList.length > 0 ? toList : [
    ],
    subject,
    html,
    priority: 'normal'
  };

  try {
    const info = transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error; // Re-throw để caller có thể handle
  }
}

module.exports = {
  generateNewReviewHTML,
  generateUpdateDeadlineHTML,
  generateRemindReviewHTML,
  sendMail
};