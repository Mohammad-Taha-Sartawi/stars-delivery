module.exports = (...allowedRoles) => (req, res, next) => {
  if (allowedRoles.includes(req.userRole)) return next();
  return res.status(403).json({ error: 'Forbidden' });
};