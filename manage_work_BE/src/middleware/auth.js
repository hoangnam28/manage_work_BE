const jwt = require('jsonwebtoken');
require('dotenv').config();

const generateAccessToken = (user) => {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '24h' });
};

const generateRefreshToken = (user) => {
  // Tăng thời gian refresh token lên 30 ngày thay vì 1 năm
  return jwt.sign(user, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '30d' });
};

const refreshAccessToken = (refreshToken) => {
  try {
    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(refreshToken, refreshSecret);

    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - currentTime;
    const sevenDaysInSeconds = 7 * 24 * 60 * 60;

    const user = {
      username: decoded.username,
      userId: decoded.userId,
      company_id: decoded.company_id,
      role: decoded.role,
      email: decoded.email
    };

    console.log('User email:', user.email);
    console.log('Payload:', user);
    console.log('Time until refresh token expiry:', timeUntilExpiry, 'seconds');

    return {
      accessToken: generateAccessToken(user),
      // Chỉ tạo refresh token mới nếu token hiện tại gần hết hạn
      refreshToken: timeUntilExpiry < sevenDaysInSeconds ? generateRefreshToken(user) : refreshToken,
      shouldUpdateRefreshToken: timeUntilExpiry < sevenDaysInSeconds
    };
  } catch (error) {
    console.error('Refresh token verification failed:', error);
    
    // Trả về error code cụ thể để frontend biết cách xử lý
    if (error.name === 'TokenExpiredError') {
      const expiredError = new Error('Refresh token expired');
      expiredError.code = 'REFRESH_TOKEN_EXPIRED';
      throw expiredError;
    } else if (error.name === 'JsonWebTokenError') {
      const invalidError = new Error('Invalid refresh token');
      invalidError.code = 'REFRESH_TOKEN_INVALID';
      throw invalidError;
    }
    
    throw new Error('Refresh token verification failed');
  }
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      message: 'Bạn không có quyền cho thao tác này',
      code: 'NO_TOKEN'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Token verification failed:', err);
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          message: 'Token đã hết hạn',
          code: 'ACCESS_TOKEN_EXPIRED'
        });
      }
      return res.status(403).json({ 
        message: 'Token không hợp lệ',
        code: 'INVALID_TOKEN'
      });
    }
    req.user = user;
    next();
  });
};

const checkEditPermission = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      message: 'Vui lòng đăng nhập lại',
      code: 'USER_NOT_AUTHENTICATED'
    });
  }

  if (
    req.user.company_id !== '021253' &&
    req.user.company_id !== '000001') {
    return res.status(403).json({ 
      message: 'Bạn không có quyền thực hiện thao tác này',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Thêm middleware để kiểm tra role
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Vui lòng đăng nhập lại',
        code: 'USER_NOT_AUTHENTICATED'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Bạn không có quyền truy cập tài nguyên này',
        code: 'ROLE_NOT_AUTHORIZED'
      });
    }
    next();
  };
};

// Utility function để kiểm tra token có hợp lệ không
const verifyToken = (token, secret = process.env.JWT_SECRET) => {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
};

// Route để refresh token
const handleRefreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(401).json({ 
      message: 'Refresh token is required',
      code: 'NO_REFRESH_TOKEN'
    });
  }

  try {
    const result = refreshAccessToken(refreshToken);
    res.json(result);
  } catch (error) {
    console.error('Refresh token error:', error);
    
    if (error.code === 'REFRESH_TOKEN_EXPIRED') {
      return res.status(401).json({ 
        message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
        code: 'REFRESH_TOKEN_EXPIRED'
      });
    }
    
    return res.status(403).json({ 
      message: 'Refresh token không hợp lệ',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
};
const checkMaterialCorePermission = (requiredActions = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Vui lòng đăng nhập lại',
        code: 'USER_NOT_AUTHENTICATED'
      });
    }

    // Chuyển đổi role thành mảng nếu là string
    let userRoles = [];
    if (typeof req.user.role === 'string' && req.user.role.includes(',')) {
      userRoles = req.user.role.split(',').map(r => r.trim());
    } else if (Array.isArray(req.user.roles)) {
      userRoles = req.user.roles;
    } else if (req.user.role) {
      userRoles = [req.user.role];
    }

    // Định nghĩa quyền cho từng role
    const rolePermissions = {
      'admin': ['view', 'create', 'edit', 'delete', 'approve', 'cancel'],
      'editor': ['view', 'create', 'edit', 'delete'],
      'viewer': ['view'],
    };

    // Gộp quyền từ tất cả roles mà user có
    const userPermissions = userRoles.reduce((perms, role) => {
      const rolePerms = rolePermissions[role.toLowerCase()] || [];
      return perms.concat(rolePerms);
    }, []);

    // Loại bỏ quyền trùng lặp và chuyển về lowercase để so sánh
    const uniquePermissions = [...new Set(userPermissions)].map(p => p.toLowerCase());
    const requiredActionsLower = requiredActions.map(a => a.toLowerCase());

    // Check xem user có đủ các requiredActions không
    const hasPermission = requiredActionsLower.every(action =>
      uniquePermissions.includes(action)
    );

    if (!hasPermission) {
      console.log('Permission check failed:', {
        user: req.user.username,
        roles: userRoles,
        requiredActions: requiredActions,
        userPermissions: uniquePermissions
      });
      
      return res.status(403).json({ 
        message: 'Bạn không có quyền thực hiện thao tác này',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredActions,
        userRoles,
        userPermissions: uniquePermissions
      });
    }

    next();
  };
};


module.exports = {
  authenticateToken,
  checkEditPermission,
  checkRole,
  checkMaterialCorePermission, 
  generateAccessToken,
  generateRefreshToken,
  refreshAccessToken,
  verifyToken,
  handleRefreshToken
};