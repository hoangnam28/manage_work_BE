const AUTHORIZED_COMPANY_IDS = ['017965', '006065', '003524', '008247', '006064'];

const checkEditPermission = (req, res, next) => {
  const user = req.user;

  if (!user || !user.company_id) {
    return res.status(403).json({ message: 'Không có quyền truy cập' });
  }
  // Chuẩn hóa company_id trước khi so sánh
  const userCompanyId = user.company_id.toString().trim();
  const hasEditPermission = AUTHORIZED_COMPANY_IDS.some(id => id === userCompanyId);

  console.log('Backend - Has permission:', hasEditPermission);

  req.hasEditPermission = hasEditPermission;
  next();
};

module.exports = { checkEditPermission }; 