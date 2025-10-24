const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const database = require('./config/database');
const database2 = require('./config/database_2');
const authRoutes = require('./routes/auth');
const documentationRoutes = require('./routes/document');
const impedanceRoutes = require('./routes/impedance');
const userRoutes = require('./routes/user');
const materialCoreRoutes = require('./routes/material-core');
const materialPPRoutes = require('./routes/material-pp');
const materialNewRoutes = require('./routes/material-new');
const largeSize = require('./routes/large-size');
const { router: materialCoreHistoryRouter } = require('./routes/material-core-history');
const { router: materialPPHistoryRoutes } = require('./routes/material-pp-history');
const { router: materialNewHistoryRoutes } = require('./routes/material-new-history');
const ulMaterial = require('./routes/ul');
const materialCertificationRoutes = require('./routes/material-certification');
const timeTrackingRoutes = require('./routes/time-tracking');
const inkManagementRoutes = require('./routes/ink-management');
const bussinessRotes = require('./routes/bussiness');
const projectRoutes = require('./routes/project');
const taskRoutes = require('./routes/task');
const dashboardRoutes = require('./routes/dashboard');
const settingRoutes = require('./routes/setting');
const path = require('path');
const fs = require('fs');
const app = express();

// ===== THÊM DÒNG NÀY ĐỂ KHỞI ĐỘNG CRON JOB =====
require('./helper/cronJobs');
console.log('📅 Email reminder cron job has been initialized');
// ===============================================

const allowedOrigins = ['http://localhost:8888', 'http://192.84.105.173:8888'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

Promise.all([
  database.initialize(),
  database2.initialize()
])
  .then(() => {
    console.log('Both database initalize succesfully!');
  })
  .catch(err => {
    console.error('Lỗi khởi tạo database:', err);
    process.exit(1);
  });

app.use('/api/auth', authRoutes);

app.use('/api/document', documentationRoutes);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/impedance', impedanceRoutes);

app.use('/api/user', userRoutes); 

app.use('/api/material-core', materialCoreRoutes); 

app.use('/api/material-pp', materialPPRoutes);

app.use('/api/large-size', largeSize);

app.use('/api/material-new', materialNewRoutes);

app.use('/api/material-core-history', materialCoreHistoryRouter);
  
app.use('/api/material-pp-history', materialPPHistoryRoutes);

app.use('/api/material-new-history', materialNewHistoryRoutes);

app.use('/api/ul', ulMaterial);

app.use('/api/material-certification', materialCertificationRoutes);

app.use('/api/time-tracking', timeTrackingRoutes);

app.use('/api/ink-management', inkManagementRoutes);

app.use('/api/bussiness', bussinessRotes);

app.use('/api/dashboard', dashboardRoutes);

app.use('/api/projects', projectRoutes);

app.use('/api/tasks', taskRoutes);

app.use('/api/settings', settingRoutes);

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

process.on('SIGINT', async () => {
  try {
    await database.closePool();
    await database2.closePool();
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`📧 Email reminder system is active - will run daily at 9:15 AM (Asia/Ho_Chi_Minh)`);
});