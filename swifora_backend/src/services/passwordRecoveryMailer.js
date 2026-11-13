const nodemailer = require('nodemailer');

const {
  loadPasswordRecoveryMailConfig,
} = require('../config');

function createPasswordRecoveryMailer({
  config =
    loadPasswordRecoveryMailConfig(),

  nodemailerModule =
    nodemailer,
} = {}) {
  const {
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpFrom,
    smtpUser,
    smtpPass,
  } = config;

  const transportOptions = {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,

    // Explicit STARTTLS transports must fail closed if
    // encryption cannot be negotiated.
    requireTLS:
      !smtpSecure,

    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    },
  };

  if (
    smtpUser
    && smtpPass
  ) {
    transportOptions.auth = {
      user: smtpUser,
      pass: smtpPass,
    };
  }

  const transporter =
    nodemailerModule.createTransport(
      transportOptions,
    );

  async function sendRecoveryCode({
    to,
    code,
  }) {
    return transporter.sendMail({
      from: smtpFrom,
      to,
      subject:
        'Stars Delivery password recovery code',
      text:
        `Your Stars Delivery password recovery code is ${code}.\n\n`
        + 'This code expires in 10 minutes and can be used only once.\n\n'
        + 'If you did not request a password reset, ignore this email.',
    });
  }

  async function sendPasswordChangedNotice({
    to,
  }) {
    return transporter.sendMail({
      from: smtpFrom,
      to,
      subject:
        'Stars Delivery password changed',
      text:
        'Your Stars Delivery password was changed using the password recovery flow.\n\n'
        + 'If you did not perform this action, contact support immediately.',
    });
  }

  return {
    sendRecoveryCode,
    sendPasswordChangedNotice,
  };
}

let defaultMailer = null;

function getPasswordRecoveryMailer() {
  if (!defaultMailer) {
    defaultMailer =
      createPasswordRecoveryMailer();
  }

  return defaultMailer;
}

module.exports = {
  createPasswordRecoveryMailer,
  getPasswordRecoveryMailer,
};
