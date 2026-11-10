const {
  sendInternalServerError,
  isDatabaseUnavailableError,
  sendDatabaseUnavailable,
} = require('./security/errorResponse');
const { createAdminBrowserHeaders } = require('./security/adminBrowserHeaders');
const { adminCsrfProtection } = require('./security/adminCsrf');
const adminAuditLogger = require('./middleware/adminAuditLog');
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');
const { loadAppConfig } = require('./config');
const { expireStaleOffers, finalizeExpiredOrders } = require('./services/orderLifecycle');
const { createAdminSessionMiddleware } = require('./middleware/adminSession');
const requireAdminSession = require('./middleware/requireAdminSession');
const authenticateSocket = require('./socket/authenticateSocket');
const {
  isActiveAdminAccount,
  adminSessionVersionMatches,
} = require('./services/adminAccounts');
const {
  isActiveMobileAccount,
  mobileSessionVersionMatches,
} = require('./services/mobileSession');
const { governorateKey } = require('./services/registrationLocation');
const { createOriginGuard, corsOptionsForRequest, socketOriginAllowed } = require('./security/originPolicy');
const {
  isSafeUploadExtension,
} = require('./services/adImageStorage');
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const providerRoutes = require('./routes/provider');
const offerRoutes = require('./routes/offers');
const notificationRoutes = require('./routes/notifications');
const reportRoutes = require('./routes/reports');
const chatRoutes = require('./routes/chat');
const userRoutes = require('./routes/users');
const adRoutes = require('./routes/ads');

const adminAuthRoutes = require('./routes/adminAuth');
const adminDriverRoutes = require('./routes/adminDrivers');
const adminUserRoutes = require('./routes/adminUsers');
const adminReportRoutes = require('./routes/adminReports');
const adminCommissionRoutes = require('./routes/adminCommissions');
const adminAreaRoutes = require('./routes/adminAreas');
const adminBroadcastRoutes = require('./routes/adminBroadcast');
const adminChatRoutes = require('./routes/adminChat');
const adminOrderRoutes = require('./routes/adminOrders');
const adminApiRoutes = require('./routes/adminApi');
const adminAdRoutes = require('./routes/adminAds');

const app = express();
const appConfig = loadAppConfig();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: {
    policy: 'no-referrer',
  },
}));

function getLanIp() {
  const ifaces = os.networkInterfaces();
  // Skip virtual adapters (VMware, VirtualBox, Hyper-V, WSL) — phones can't reach them
  const virtualNames = /vmware|virtualbox|vethernet|wsl|hyper-v|loopback/i;
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    if (virtualNames.test(name)) continue;
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) candidates.push(iface.address);
    }
  }
  // Prefer common home-LAN ranges over anything else
  const preferred = candidates.find(ip => ip.startsWith('192.168.1.') || ip.startsWith('192.168.0.') || ip.startsWith('10.'));
  return preferred || candidates[0] || '127.0.0.1';
}
const lanIp = isProduction ? null : getLanIp();

app.use(createOriginGuard({
  allowedOrigins: appConfig.allowedOrigins,
}));

app.use(cors((req, callback) => {
  callback(
    null,
    corsOptionsForRequest(
      req,
      appConfig.allowedOrigins,
    ),
  );
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const uploadedFilesRoot = path.join(__dirname, '..', 'uploads');

app.use('/uploads', (req, res, next) => {
  if (!isSafeUploadExtension(req.path)) {
    return res.status(404).end();
  }

  res.set({
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Cache-Control': 'private, max-age=86400',
    'Content-Disposition': 'inline',
  });

  return next();
}, express.static(uploadedFilesRoot, {
  dotfiles: 'deny',
  index: false,
}));

app.use('/data', express.static(path.join(__dirname, 'public', 'data')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/config') {
    return next();
  }

  if (mongoose.connection.readyState === 1) {
    return next();
  }

  return sendDatabaseUnavailable(res);
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views', 'admin'));

const mongoClientPromise = new Promise((resolve) => {
  const resolveWhenConnected = () => {
    if (mongoose.connection.readyState === 1) {
      try {
        resolve(mongoose.connection.getClient());
        return;
      } catch (_) {}
    }

    setTimeout(resolveWhenConnected, 1000);
  };

  resolveWhenConnected();
});

const sessionMiddleware = createAdminSessionMiddleware({
  clientPromise: mongoClientPromise,
  sessionSecret: appConfig.sessionSecret,
});
app.use(sessionMiddleware);

const adminBrowserHeaders =
  createAdminBrowserHeaders();

app.use(
  '/admin',
  adminBrowserHeaders,
);

app.use(
  '/admin',
  adminAuditLogger,
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.admin || null;
  next();
});

const Order = require('./models/Order');
const Offer = require('./models/Offer');
const RejectedOrder = require('./models/RejectedOrder');
const Notification = require('./models/Notification');
const ChatMessage = require('./models/ChatMessage');
const ContactRequest = require('./models/ContactRequest');
const BroadcastMessage = require('./models/BroadcastMessage');
const CommissionPayment = require('./models/CommissionPayment');
const Rating = require('./models/Rating');
const CommissionSetting = require('./models/CommissionSetting');
const PushToken = require('./models/PushToken');
const AdminAuditLog = require('./models/AdminAuditLog');
const Ad = require('./models/Ad');
const User = require('./models/User');

const MONGO_RETRY_DELAYS_MS = Object.freeze([
  5000,
  10000,
  20000,
  30000,
]);

let mongoRetryIndex = 0;
let mongoConnecting = false;
let offerCleanupTimer = null;

async function ensureMongoIndexes() {
  await Promise.all([
    Order.createIndexes(),
    Offer.createIndexes(),
    RejectedOrder.createIndexes(),
    Notification.createIndexes(),
    ChatMessage.createIndexes(),
    ContactRequest.createIndexes(),
    BroadcastMessage.createIndexes(),
    CommissionPayment.createIndexes(),
    Rating.createIndexes(),
    CommissionSetting.createIndexes(),
    PushToken.createIndexes(),
    AdminAuditLog.createIndexes(),
    Ad.createIndexes(),
  ]);
  console.log('Indexes ready');
}

function startOfferCleanup() {
  if (offerCleanupTimer) {
    return;
  }

  offerCleanupTimer = setInterval(async () => {
    if (mongoose.connection.readyState !== 1) {
      return;
    }

    try {
      await expireStaleOffers();
      await finalizeExpiredOrders();
    } catch (_) {}
  }, 30000);
}

async function connectMongo() {
  if (mongoConnecting) {
    return;
  }

  mongoConnecting = true;

  try {
    await mongoose.connect(appConfig.mongodbUri, {
      serverSelectionTimeoutMS: 10000,
    });
  } catch (err) {
    const delay = MONGO_RETRY_DELAYS_MS[
      Math.min(mongoRetryIndex, MONGO_RETRY_DELAYS_MS.length - 1)
    ];
    mongoRetryIndex += 1;
    const reason = String(err?.message || err).split('\n')[0];
    console.error(`MongoDB connection failed; retrying in ${Math.round(delay / 1000)}s: ${reason}`);

    if (/tlsv1 alert internal error|SSL alert number 80/i.test(reason)) {
      console.error('Atlas rejected the TLS handshake; add this machine public IP to Atlas Network Access or resume the cluster.');
    }

    setTimeout(connectMongo, delay);
    return;
  } finally {
    mongoConnecting = false;
  }

  console.log('MongoDB connected');
  mongoRetryIndex = 0;
  startOfferCleanup();

  try {
    await ensureMongoIndexes();
  } catch (err) {
    console.error('MongoDB index initialization failed:', String(err?.message || err).split('\n')[0]);
  }
}

connectMongo();

mongoose.connection.on('disconnected', () => {
  console.error('MongoDB disconnected; waiting for automatic reconnect');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', String(error?.message || error).split('\n')[0]);
});

let server;
let io;

const setupIO = () => {
  io = new Server(server, {
    cors: {
      origin: appConfig.allowedOrigins,
      credentials: true,
    },
    allowRequest: (req, callback) => {
      callback(
        null,
        socketOriginAllowed(
          req,
          appConfig.allowedOrigins,
        ),
      );
    },
  });
  io.engine.use(sessionMiddleware);

io.use(async (socket, next) => {
  try {
    const identity =
      authenticateSocket(
        socket,
        appConfig.jwtSecret,
      );

    if (identity.role === 'admin') {
      const admin =
        await User.findById(
          identity.id,
          'role status deleted sessionVersion',
        );

      if (
        !isActiveAdminAccount(admin)
        || !adminSessionVersionMatches(
          admin,
          identity.sessionVersion,
        )
      ) {
        throw new Error(
          'Invalid authentication',
        );
      }
    } else {
      const user =
        await User.findById(
          identity.id,
          'role status deleted sessionVersion mustChangePassword',
        );

      if (
        !mobileSessionVersionMatches(
          user,
          identity.sessionVersion,
        )
      ) {
        throw new Error(
          'Invalid authentication',
        );
      }

      if (
        !isActiveMobileAccount(
          user,
          identity.role,
        )
        || user.mustChangePassword === true
      ) {
        throw new Error(
          'Invalid authentication',
        );
      }
    }

    socket.userId = identity.id;
    socket.userRole = identity.role;

    if (identity.expiresAt) {
      const remaining =
        identity.expiresAt
        - Date.now();

      if (remaining <= 0) {
        throw new Error(
          'Invalid authentication',
        );
      }

      socket.sessionExpiryTimer =
        setTimeout(
          () => {
            if (socket.connected) {
              socket.disconnect(true);
            }
          },
          remaining,
        );
    }

    next();
  } catch (err) {
    next(new Error('Invalid authentication'));
  }
});

io.on('connection', async (socket) => {
  socket.on('disconnect', () => {
    if (socket.sessionExpiryTimer) {
      clearTimeout(
        socket.sessionExpiryTimer,
      );

      socket.sessionExpiryTimer =
        null;
    }
  });

  if (socket.userRole === 'admin') {
    socket.join('support');
    socket.join(`admin:${socket.userId}`);
    console.log('Admin socket connected (support room)');
  } else if (socket.userRole === 'provider') {
    // Registered area is authoritative; GPS-detected query param is a fallback
    let area = '';
    let governorate = '';
    let governorateLevel = false;
    try {
      const u = await User.findById(
        socket.userId,
        'area governorate governorateLevel',
      );
      area = u?.area || socket.handshake.query?.area || '';
      governorate = governorateKey(u || {});
      governorateLevel = u?.governorateLevel === true;
    } catch {
      area = socket.handshake.query?.area || '';
    }
    socket.join(`area:${area}`);
    if (governorate && governorateLevel) {
      socket.join(`governorate:${governorate}`);
    }
    console.log(`Socket connected: ${socket.userId} (provider) area="${area}" governorate="${governorate}" governorateLevel=${governorateLevel}`);
  } else {
    console.log(`Socket connected: ${socket.userId} (${socket.userRole})`);
  }
  socket.join(`user:${socket.userId}`);
});

  io.engine.on('connection_error', (err) => {
    console.error('Socket connection error:', err.message);
  });

  app.set('io', io);
};

if (!isProduction) {
  app.get('/api/config', (req, res) => {
    // Development-only LAN discovery for Android debug builds.
    let ip = (req.socket.localAddress || '').replace(/^::ffff:/, '');

    if (
      !ip
      || ip === '::1'
      || ip === '127.0.0.1'
    ) {
      ip = lanIp;
    }

    res.json({
      lanIp: ip,
      port: parseInt(
        process.env.PORT || '3000',
        10,
      ),
    });
  });
}

app.get('/api/health', (req, res) => {
  const connected =
    mongoose.connection.readyState === 1;

  res
    .status(connected ? 200 : 503)
    .json({
      status: connected
        ? 'ok'
        : 'unavailable',
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/provider', providerRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ads', adRoutes);

app.use('/admin', adminAuthRoutes);

app.use('/admin/drivers', requireAdminSession, adminCsrfProtection, adminDriverRoutes);
app.use('/admin/users', requireAdminSession, adminCsrfProtection, adminUserRoutes);
app.use('/admin/reports', requireAdminSession, adminCsrfProtection, adminReportRoutes);
app.use('/admin/commissions', requireAdminSession, adminCsrfProtection, adminCommissionRoutes);
app.use('/admin/areas', requireAdminSession, adminCsrfProtection, adminAreaRoutes);
app.use('/admin/broadcast', requireAdminSession, adminCsrfProtection, adminBroadcastRoutes);
app.use('/admin/chat', requireAdminSession, adminCsrfProtection, adminChatRoutes);
app.use('/admin/orders', requireAdminSession, adminCsrfProtection, adminOrderRoutes);
app.use('/admin/ads', requireAdminSession, adminCsrfProtection, adminAdRoutes);
app.use('/admin/api', requireAdminSession, adminCsrfProtection, adminApiRoutes);

app.get('/admin', requireAdminSession, adminCsrfProtection, (req, res) => {
  res.render('index', { page: 'dashboard' });
});

let lastDatabaseUnavailableLogAt = 0;

app.use((err, req, res, next) => {
  if (isDatabaseUnavailableError(err)) {
    const now = Date.now();

    if (now - lastDatabaseUnavailableLogAt > 30000) {
      lastDatabaseUnavailableLogAt = now;
      console.error('Database unavailable:', String(err?.message || err).split('\n')[0]);
    }

    return sendDatabaseUnavailable(res);
  }

  console.error('Unhandled error:', err);
  sendInternalServerError(res);
});

const PORT = process.env.PORT || 3000;
const HOST = isProduction ? '127.0.0.1' : '0.0.0.0';

const startServer = (retries = 3) => {
  server = http.createServer(app);
  setupIO();

  let retriesRemaining = retries;
  let retryScheduled = false;

  const attemptListen = () => {
    retryScheduled = false;
    server.listen(PORT, HOST);
  };

  server.once('listening', () => {
    console.log(`Server running on ${HOST}:${PORT}`);
    if (!isProduction) {
      console.log(
        `LAN IP: http://${lanIp}:${PORT}`,
      );
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (retriesRemaining > 0 && !retryScheduled) {
        retriesRemaining -= 1;
        retryScheduled = true;
        console.error(`Port ${PORT} is in use, retrying in 3s... (${retriesRemaining} left)`);
        setTimeout(attemptListen, 3000);
      } else if (retriesRemaining <= 0) {
        console.error(`Port ${PORT} still in use after max retries. Exiting.`);
        process.exit(1);
      }
      return;
    }

    console.error('Server error:', err);
    process.exit(1);
  });

  attemptListen();
};

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

startServer();
