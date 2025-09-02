const jwt = require('jsonwebtoken');

module.exports = (requiredTier) => (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    const decoded = jwt.verify(token, 'secret-key');
    req.user = decoded;
    if (decoded.tier < requiredTier && !decoded.addedFeatures.includes(requiredTier)) return res.status(403).json({ error: 'Upgrade tier' });
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};