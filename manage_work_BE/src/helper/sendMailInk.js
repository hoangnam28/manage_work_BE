const nodemailer = require('nodemailer');

async function sendMail({ to, subject, html }) {
    try {
        const transporter = nodemailer.createTransport({
            host: '10.27.100.181', 
            port: 25,
            secure: false,
            tls: { 
                rejectUnauthorized: false 
            }
        });
        let recipients;
        if (typeof to === 'string') {
            recipients = to; 
        } else if (Array.isArray(to)) {
            recipients = to.join(',');
        } 

        const mailOptions = {
            from: 'mkvc.material.system@meiko-elec.com',
            to: recipients,
            subject: subject,
            html: html,
            priority: 'normal'
        };
        const info =  transporter.sendMail(mailOptions);
        return {
            success: true,
            messageId: info.messageId,
            recipients: recipients
        };

    } catch (error) {
        console.error('❌ Error sending email:', error);
        throw error; // Throw để route bắt được lỗi
    }
}

module.exports = { sendMail };