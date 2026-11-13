const jwt = require('jsonwebtoken');
const { isMobileRole } = require('../middleware/mobileRole');
const {
  tokenMobileSessionVersion,
} = require('../services/mobileSession');

function authenticateSocket(socket, jwtSecret) {
  const admin = socket.request?.session?.admin;
  if (admin?.id && admin.role === 'admin') {
    return {
      id: admin.id,
      role: 'admin',
      sessionVersion: admin.sessionVersion ?? 0,
    };
  }

  const token = socket.handshake?.auth?.token;
  if (!token) throw new Error('Authentication required');

  try {
    const decoded = jwt.verify(token, jwtSecret);
    if (!isMobileRole(decoded.role)) throw new Error('Invalid mobile role');

    const sessionVersion =
      tokenMobileSessionVersion(
        decoded.sessionVersion,
      );

    if (sessionVersion === null) {
      throw new Error(
        'Invalid session version',
      );
    }

    const identity = {
      id: decoded.id,
      role: decoded.role,
    };

    // Preserve historical identity shape for old JWTs.
    if (
      decoded.sessionVersion
      !== undefined
    ) {
      identity.sessionVersion =
        sessionVersion;
    }

    if (Number.isFinite(decoded.exp)) {
      identity.expiresAt =
        decoded.exp * 1000;
    }

    return identity;
  } catch {
    throw new Error('Invalid authentication');
  }
}

module.exports = authenticateSocket;
