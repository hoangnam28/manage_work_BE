const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const database = require('./config/database');
const authRoutes = require('./routes/auth');  
const documentationRoutes = require('./routes/document');
const impedanceRoutes = require('./routes/impedance'); // New route for Impedance
const userRoutes = require('./routes/user'); // New route for User Management
const materialCoreRoutes = require('./routes/material-core'); // New route for Material Core
const materialPPRoutes = require('./routes/material-pp');
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

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

database.initialize()
  .then(() => {
    console.log('Database initialized successfully');
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

app.use('/api/auth', authRoutes);

app.use('/api/document', documentationRoutes);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/impedance', impedanceRoutes);

app.use('/api/user', userRoutes); // Add user management routes

app.use('/api/material-core', materialCoreRoutes); // Add material core routes

app.use('/api/material-pp', materialPPRoutes);

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

process.on('SIGINT', async () => {
  try { 
    await database.closePool();
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
