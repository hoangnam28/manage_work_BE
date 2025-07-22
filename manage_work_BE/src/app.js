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
const path = require('path');
const fs = require('fs');
const app = express();

const allowedOrigins = ['http://localhost:4000', 'http://192.84.105.173:4000'];
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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
