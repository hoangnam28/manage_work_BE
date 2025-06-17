const jwt = require('jsonwebtoken');
require('dotenv').config();

const generateAccessToken = (user) => {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '24h' });
};

const generateRefreshToken = (user) => {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const refreshAccessToken = (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = {
      company_id: decoded.company_id
    };
    return {
      accessToken: generateAccessToken(user),
      refreshToken: generateRefreshToken(user)
    };
  } catch (error) {
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

module.exports = {
  authenticateToken,
  checkEditPermission,
  generateAccessToken,
  generateRefreshToken,
  refreshAccessToken
};
