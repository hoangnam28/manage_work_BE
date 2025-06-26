const jwt = require('jsonwebtoken');
require('dotenv').config();

const generateAccessToken = (user) => {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '24h' }); // Giảm thời gian
};

const generateRefreshToken = (user) => {
  return jwt.sign(user, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '7d' });
};

const refreshAccessToken = (refreshToken) => {
  try {
    // Sử dụng secret riêng cho refresh token nếu có, nếu không thì dùng JWT_SECRET
    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(refreshToken, refreshSecret);

    // Tạo user object từ decoded token
    const user = {
      username: decoded.username,
      userId: decoded.userId,
      company_id: decoded.company_id,
      role: decoded.role
    };
    return {
      accessToken: generateAccessToken(user),
      refreshToken: generateRefreshToken(user) // Tạo refresh token mới
    };
  } catch (error) {
    console.error('Refresh token verification failed:', error);
    throw new Error('Invalid refresh token');
  }
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Bạn không có quyền cho thao tác này' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Token verification failed:', err);
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token đã hết hạn' });
      }
      return res.status(403).json({ message: 'Token không hợp lệ' });
    }
    req.user = user;
    next();
  });
};

const checkEditPermission = async (req, res, next) => {
  if (
    req.user.company_id !== '021253' &&
    req.user.company_id !== '000001') {
    return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
  }
  next();
};

// Utility function để kiểm tra token có hợp lệ không
const verifyToken = (token, secret = process.env.JWT_SECRET) => {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticateToken,
  checkEditPermission,
  generateAccessToken,
  generateRefreshToken,
  refreshAccessToken,
  verifyToken
};