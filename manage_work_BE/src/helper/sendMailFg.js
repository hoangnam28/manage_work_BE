const nodemailer = require('nodemailer');

async function sendMail(subject, html, toList) {
    const transporter = nodemailer.createTransport({
        host: '10.27.100.181',
        port: 25,
        secure: false,
        tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
        from: 'mkvc.manage.work.system@meiko-elec.com',
        to: Array.isArray(toList) && toList.length > 0 ? toList : [
            'MKVC_PD5@meiko-elec.com',
            'nam.nguyenhoang@meiko-elec.com',
            'trang.nguyenkieu@meiko-elec.com'
        ],
        subject,
        html,
        priority: 'normal'
    };

     transporter.sendMail(mailOptions);
}

module.exports = { sendMail };