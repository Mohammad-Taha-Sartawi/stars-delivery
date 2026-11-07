const INTERNAL_SERVER_ERROR = 'Server error';
const DATABASE_UNAVAILABLE = 'Database temporarily unavailable';

function sendInternalServerError(res) {
  return res.status(500).json({
    error: INTERNAL_SERVER_ERROR,
  });
}

function sendInternalServerFailure(res) {
  return res.status(500).json({
    success: false,
    message: INTERNAL_SERVER_ERROR,
  });
}

function isDatabaseUnavailableError(error) {
  const name = error?.name || '';
  const message = typeof error?.message === 'string'
    ? error.message
    : '';

  return name === 'MongoServerSelectionError'
    || name === 'MongooseServerSelectionError'
    || name === 'MongoNetworkError'
    || name === 'MongoTopologyClosedError'
    || /buffering timed out/i.test(message)
    || /Mongo(?:ServerSelection|Network|TopologyClosed)Error/.test(message);
}

function sendDatabaseUnavailable(res) {
  return res.status(503).json({
    error: DATABASE_UNAVAILABLE,
    code: 'DATABASE_UNAVAILABLE',
  });
}

module.exports = {
  INTERNAL_SERVER_ERROR,
  DATABASE_UNAVAILABLE,
  sendInternalServerError,
  sendInternalServerFailure,
  isDatabaseUnavailableError,
  sendDatabaseUnavailable,
};
