const {
  ipKeyGenerator,
  rateLimit,
} = require('express-rate-limit');

const ACTION_RATE_LIMIT_RESPONSE = Object.freeze({
  error: 'Too many requests. Please try again later.',
  code: 'RATE_LIMITED',
});

const ORDER_CREATE_WINDOW_MS = 10 * 60 * 1000;
const ORDER_CREATE_LIMIT = 5;
const ORDER_CREATE_IP_LIMIT = 20;

const OFFER_CREATE_WINDOW_MS = 10 * 60 * 1000;
const OFFER_CREATE_LIMIT = 30;
const OFFER_CREATE_IP_LIMIT = 90;

const CHAT_SEND_WINDOW_MS = 60 * 1000;
const CHAT_SEND_LIMIT = 30;
const CHAT_SEND_IP_LIMIT = 120;

const REPORT_CREATE_WINDOW_MS = 60 * 60 * 1000;
const REPORT_CREATE_LIMIT = 5;
const REPORT_CREATE_IP_LIMIT = 20;

const LOCATION_UPDATE_WINDOW_MS = 60 * 1000;
const LOCATION_UPDATE_LIMIT = 120;
const LOCATION_UPDATE_IP_LIMIT = 300;

const PUSH_TOKEN_WINDOW_MS = 60 * 60 * 1000;
const PUSH_TOKEN_LIMIT = 20;
const PUSH_TOKEN_IP_LIMIT = 60;

function authenticatedUserKey(req, prefix) {
  const userId =
    req.userId
    || req.authUser?._id
    || req.authUser?.id;

  if (userId) {
    return `${prefix}:user:${String(userId)}`;
  }

  return `${prefix}:ip:${ipKeyGenerator(
    typeof req.ip === 'string' && req.ip
      ? req.ip
      : 'unknown',
  )}`;
}

function createActionLimiter({
  prefix,
  windowMs,
  limit,
}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) =>
      authenticatedUserKey(req, prefix),
    handler: (_req, res) =>
      res.status(429).json(
        ACTION_RATE_LIMIT_RESPONSE,
      ),
  });
}

function createIpActionLimiter({
  prefix,
  windowMs,
  limit,
}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) =>
      `${prefix}:ip:${ipKeyGenerator(
        typeof req.ip === 'string' && req.ip
          ? req.ip
          : 'unknown',
      )}`,
    handler: (_req, res) =>
      res.status(429).json(
        ACTION_RATE_LIMIT_RESPONSE,
      ),
  });
}

const orderCreateLimiter = createActionLimiter({
  prefix: 'order-create',
  windowMs: ORDER_CREATE_WINDOW_MS,
  limit: ORDER_CREATE_LIMIT,
});

const orderCreateIpLimiter = createIpActionLimiter({
  prefix: 'order-create',
  windowMs: ORDER_CREATE_WINDOW_MS,
  limit: ORDER_CREATE_IP_LIMIT,
});

const offerCreateLimiter = createActionLimiter({
  prefix: 'offer-create',
  windowMs: OFFER_CREATE_WINDOW_MS,
  limit: OFFER_CREATE_LIMIT,
});

const offerCreateIpLimiter = createIpActionLimiter({
  prefix: 'offer-create',
  windowMs: OFFER_CREATE_WINDOW_MS,
  limit: OFFER_CREATE_IP_LIMIT,
});

const chatSendLimiter = createActionLimiter({
  prefix: 'chat-send',
  windowMs: CHAT_SEND_WINDOW_MS,
  limit: CHAT_SEND_LIMIT,
});

const chatSendIpLimiter = createIpActionLimiter({
  prefix: 'chat-send',
  windowMs: CHAT_SEND_WINDOW_MS,
  limit: CHAT_SEND_IP_LIMIT,
});

const reportCreateLimiter = createActionLimiter({
  prefix: 'report-create',
  windowMs: REPORT_CREATE_WINDOW_MS,
  limit: REPORT_CREATE_LIMIT,
});

const reportCreateIpLimiter = createIpActionLimiter({
  prefix: 'report-create',
  windowMs: REPORT_CREATE_WINDOW_MS,
  limit: REPORT_CREATE_IP_LIMIT,
});

const locationUpdateLimiter = createActionLimiter({
  prefix: 'location-update',
  windowMs: LOCATION_UPDATE_WINDOW_MS,
  limit: LOCATION_UPDATE_LIMIT,
});

const locationUpdateIpLimiter = createIpActionLimiter({
  prefix: 'location-update',
  windowMs: LOCATION_UPDATE_WINDOW_MS,
  limit: LOCATION_UPDATE_IP_LIMIT,
});

const pushTokenLimiter = createActionLimiter({
  prefix: 'push-token',
  windowMs: PUSH_TOKEN_WINDOW_MS,
  limit: PUSH_TOKEN_LIMIT,
});

const pushTokenIpLimiter = createIpActionLimiter({
  prefix: 'push-token',
  windowMs: PUSH_TOKEN_WINDOW_MS,
  limit: PUSH_TOKEN_IP_LIMIT,
});

module.exports = {
  ACTION_RATE_LIMIT_RESPONSE,
  ORDER_CREATE_WINDOW_MS,
  ORDER_CREATE_LIMIT,
  ORDER_CREATE_IP_LIMIT,
  OFFER_CREATE_WINDOW_MS,
  OFFER_CREATE_LIMIT,
  OFFER_CREATE_IP_LIMIT,
  CHAT_SEND_WINDOW_MS,
  CHAT_SEND_LIMIT,
  CHAT_SEND_IP_LIMIT,
  REPORT_CREATE_WINDOW_MS,
  REPORT_CREATE_LIMIT,
  REPORT_CREATE_IP_LIMIT,
  LOCATION_UPDATE_WINDOW_MS,
  LOCATION_UPDATE_LIMIT,
  LOCATION_UPDATE_IP_LIMIT,
  PUSH_TOKEN_WINDOW_MS,
  PUSH_TOKEN_LIMIT,
  PUSH_TOKEN_IP_LIMIT,
  createActionLimiter,
  createIpActionLimiter,
  orderCreateLimiter,
  orderCreateIpLimiter,
  offerCreateLimiter,
  offerCreateIpLimiter,
  chatSendLimiter,
  chatSendIpLimiter,
  reportCreateLimiter,
  reportCreateIpLimiter,
  locationUpdateLimiter,
  locationUpdateIpLimiter,
  pushTokenLimiter,
  pushTokenIpLimiter,
};
