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
        'Swifora password recovery code',
      text:
        `Your Swifora password recovery code is ${code}.\n\n`
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
        'Swifora password changed',
      text:
        'Your Swifora password was changed using the password recovery flow.\n\n'
        + 'If you did not perform this action, contact support immediately.',
    });
  }

  async function sendSupportReply({
    to,
    name,
    text,
  }) {
    return transporter.sendMail({
      from: smtpFrom,
      to,
      subject:
        'رد فريق دعم Swifora',
      text:
        `مرحباً ${name || ''}،\n\n${text}\n\n`
        + 'يمكنك متابعة المحادثة من نافذة "التواصل مع الدعم" في تطبيق Swifora.\n\n'
        + 'فريق Swifora',
    });
  }

  return {
    sendRecoveryCode,
    sendPasswordChangedNotice,
    sendSupportReply,
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
