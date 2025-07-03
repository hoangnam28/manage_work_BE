// Sử dụng Node.js với thư viện nodemailer
const nodemailer = require('nodemailer');

async function sendMail(subject, html) {
    const transporter = nodemailer.createTransport({
        host: '10.26.10.100',
        port: 25,
        secure: false,
        tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
        from: 'mkvc.document-managementsystem@meiko-elec.com',
        to: [
            'thanh.vutien@meiko-elec.com',
            'nam.nguyenhoang@meiko-elec.com'
        ],
        subject,
        html,
        priority: 'normal'
    };

    await transporter.sendMail(mailOptions);
}

function sendMailBrowser(jobName, staffName) {
    // Cần include EmailJS library trước:
    // <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>
    
    const templateParams = {
        job_name: jobName,
        staff_name: staffName,
        to_email: 'thanh.vutien@meiko-elec.com,trung.khuatvan@meiko-elec.com,phu.mai@meiko-elec.com,hong.ha@meiko-elec.com'
    };

    // Ensure emailjs is available from the global window object
    const emailjsInstance = (typeof window !== 'undefined' && window.emailjs) ? window.emailjs : null;
    if (!emailjsInstance) {
        alert('EmailJS library is not loaded.');
        return 1;
    }
    return emailjsInstance.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams)
        .then((response) => {
            console.log('Email sent successfully:', response.status, response.text);
            return 0;
        })
        .catch((error) => {
            console.error('Không gửi được Mail:', error);
            alert('Không gửi được Mail: ' + error.text);
            return 1;
        });
}
async function sendMailViaAPI(jobName, staffName) {
    try {
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jobName: jobName,
                staffName: staffName
            })
        });

        if (response.ok) {
            console.log('Email sent successfully');
            return 0;
        } else {
            throw new Error('Failed to send email');
        }
    } catch (error) {
        console.error('Không gửi được Mail:', error.message);
        alert('Không gửi được Mail: ' + error.message);
        return 1;
    }
}

module.exports = { sendMail, sendMailBrowser, sendMailViaAPI };