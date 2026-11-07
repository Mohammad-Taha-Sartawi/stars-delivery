const helmet = require('helmet');

const INVALID_CSP_HOST =
  'invalid.invalid';

function getCspRequestHost(req) {
  const rawHost =
    req.get('host');

  if (typeof rawHost !== 'string') {
    return null;
  }

  const host =
    rawHost.trim();

  const match = host.match(
    /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::([0-9]{1,5}))?$/,
  );

  if (!match) {
    return null;
  }

  if (
    match[1]
    && Number(match[1]) > 65535
  ) {
    return null;
  }

  return host;
}

function sameHostSocketSource(scheme) {
  return (req) => {
    const host =
      getCspRequestHost(req)
      || INVALID_CSP_HOST;

    return `${scheme}://${host}`;
  };
}

function createAdminBrowserHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: [
          "'self'",
        ],
        baseUri: [
          "'none'",
        ],
        connectSrc: [
          "'self'",
          sameHostSocketSource('ws'),
          sameHostSocketSource('wss'),
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com',
          'https://cdnjs.cloudflare.com',
        ],
        formAction: [
          "'self'",
        ],
        frameAncestors: [
          "'none'",
        ],
        frameSrc: [
          "'none'",
        ],
        imgSrc: [
          "'self'",
          'data:',
        ],
        objectSrc: [
          "'none'",
        ],
        scriptSrc: [
          "'self'",
        ],
        scriptSrcAttr: [
          "'none'",
        ],
        styleSrc: [
          "'self'",
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com',
        ],
        styleSrcAttr: [
          "'none'",
        ],
        workerSrc: [
          "'none'",
        ],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: {
      action: 'deny',
    },
    referrerPolicy: {
      policy: 'same-origin',
    },
  });
}

module.exports = {
  createAdminBrowserHeaders,
};
