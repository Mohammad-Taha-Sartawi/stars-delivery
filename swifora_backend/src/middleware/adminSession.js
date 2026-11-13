const session = require('express-session');
const MongoStore = require('connect-mongo').default;

const ADMIN_SESSION_COOKIE = 'stars_admin.sid';
const SESSION_TTL_SECONDS = 24 * 60 * 60;

function createAdminSessionOptions({ mongoUri, sessionSecret, store, clientPromise, isProduction = process.env.NODE_ENV === 'production' }) {
  let sessionStore = store;

  if (!sessionStore) {
    if (clientPromise) {
      sessionStore = MongoStore.create({
        clientPromise,
        collectionName: 'admin_sessions',
        ttl: SESSION_TTL_SECONDS,
      });
    } else {
      sessionStore = MongoStore.create({
        mongoUrl: mongoUri,
        collectionName: 'admin_sessions',
        ttl: SESSION_TTL_SECONDS,
      });
    }
  }

  return {
    name: ADMIN_SESSION_COOKIE,
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: SESSION_TTL_SECONDS * 1000,
    },
  };
}

function createAdminSessionMiddleware(options) {
  return session(createAdminSessionOptions(options));
}

module.exports = { ADMIN_SESSION_COOKIE, createAdminSessionOptions, createAdminSessionMiddleware };