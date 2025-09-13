const cron = require('node-cron');
const { checkAndSendReviewReminders } = require('./reviewReminder');

// Chạy vào 9:00 sáng mỗi thứ Hai
cron.schedule('0 9 * * 1', async () => {
    console.log('Bắt đầu kiểm tra và gửi mail nhắc nhở review...');
    await checkAndSendReviewReminders();
}, {
    timezone: "Asia/Ho_Chi_Minh"
});
