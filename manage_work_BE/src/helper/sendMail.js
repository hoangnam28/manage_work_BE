// Sử dụng Node.js với thư viện nodemailer
const nodemailer = require('nodemailer');

async function sendMail(subject, html, toList) {
    const transporter = nodemailer.createTransport({
        host: '10.26.10.100',
        port: 25,
        secure: false,
        tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
        from: 'mkvc.board_large_size_system@meiko-elec.com',
        to: Array.isArray(toList) && toList.length > 0 ? toList : [
            'thanh.vutien@meiko-elec.com',
            'nam.nguyenhoang@meiko-elec.com',
            'trang.nguyenkieu@meiko-elec.com'
        ],
        subject,
        html,
        priority: 'normal'
    };

    await transporter.sendMail(mailOptions);
}

module.exports = { sendMail };