const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const database = require('./config/database');
const authRoutes = require('./routes/auth');  
const reviewRoutes = require('./routes/review'); 
const documentationRoutes = require('./routes/document');
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

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

database.initialize()
  .then(() => {
    console.log('Database initialized successfully');
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

app.use('/api/auth', authRoutes);

app.use('/api/review', reviewRoutes);

app.use('/api/document', documentationRoutes);

// Thêm middleware để phục vụ file tĩnh từ thư mục uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('Created uploads directory at:', uploadDir);
}

process.on('SIGINT', async () => {
  try { 
    await database.closePool();
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
});

database.initialize();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
