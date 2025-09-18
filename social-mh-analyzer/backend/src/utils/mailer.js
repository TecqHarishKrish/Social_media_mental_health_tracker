import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create a test account if in development
const createTestAccount = async () => {
  if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_HOST) {
    const testAccount = await nodemailer.createTestAccount();
    return {
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    };
  }
  return null;
};

// Create transporter
const createTransporter = async () => {
  // For production or if email config is provided
  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    });
  }

  // For development with test account
  const testAccountConfig = await createTestAccount();
  if (testAccountConfig) {
    return nodemailer.createTransport(testAccountConfig);
  }

  // Fallback to console logging in development
  return {
    sendMail: (options) => {
      console.log('Email not sent - no email configuration');
      console.log('Email options:', JSON.stringify(options, null, 2));
      return { messageId: 'console-message-id' };
    },
  };
};

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string|Array} options.to - Comma separated list or array of recipients
 * @param {string} options.subject - Subject line
 * @param {string} options.text - Plain text body
 * @param {string} [options.html] - HTML body
 * @param {Array} [options.attachments] - Email attachments
 * @returns {Promise<Object>} - Result of sending the email
 */
const sendEmail = async ({ to, subject, text, html, attachments = [] }) => {
  try {
    const transporter = await createTransporter();

    // Ensure 'to' is an array
    const toArray = Array.isArray(to) ? to : to.split(',').map((email) => email.trim());

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@socialmhanalyzer.com',
      to: toArray.join(','),
      subject,
      text,
      html,
      attachments,
    };

    const info = await transporter.sendMail(mailOptions);

    // Log the preview URL in development when using ethereal.email
    if (process.env.NODE_ENV === 'development' && info.messageId) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log('Preview URL: %s', previewUrl);
      }
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info) || null,
    };
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Send a password reset email
 * @param {string} email - User's email
 * @param {string} resetToken - Password reset token
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Result of sending the email
 */
const sendPasswordResetEmail = async (email, resetToken, userId) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&id=${userId}`;
  
  return sendEmail({
    to: email,
    subject: 'Password Reset Request',
    text: `You are receiving this email because you (or someone else) has requested a password reset.\n\n` +
      `Please click on the following link to complete the process:\n\n` +
      `${resetUrl}\n\n` +
      `If you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>You are receiving this email because you (or someone else) has requested a password reset.</p>
        <p>Please click the button below to reset your password. This link will expire in 1 hour.</p>
        <div style="margin: 25px 0;">
          <a href="${resetUrl}" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Reset Password
          </a>
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all;">${resetUrl}</p>
        <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
        <p>Best regards,<br>The Social MH Analyzer Team</p>
      </div>
    `,
  });
};

/**
 * Send a welcome email to new users
 * @param {string} email - User's email
 * @param {string} name - User's name
 * @returns {Promise<Object>} - Result of sending the email
 */
const sendWelcomeEmail = async (email, name) => {
  const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  return sendEmail({
    to: email,
    subject: 'Welcome to Social MH Analyzer',
    text: `Hi ${name},\n\nThank you for registering with Social MH Analyzer. We're excited to help you track and understand your social media habits and mental well-being.\n\nGet started by logging in to your account and connecting your social media profiles.\n\nBest regards,\nThe Social MH Analyzer Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Social MH Analyzer, ${name}!</h2>
        <p>Thank you for registering with Social MH Analyzer. We're excited to help you track and understand your social media habits and mental well-being.</p>
        <p>Get started by connecting your social media accounts or uploading your data to get personalized insights.</p>
        <div style="margin: 25px 0;">
          <a href="${appUrl}/dashboard" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Go to Dashboard
          </a>
        </div>
        <p>If you have any questions, feel free to reply to this email.</p>
        <p>Best regards,<br>The Social MH Analyzer Team</p>
      </div>
    `,
  });
};

/**
 * Send a notification to parents/guardians
 * @param {string} email - Parent/guardian's email
 * @param {string} childName - Child's name
 * @param {string} message - Notification message
 * @returns {Promise<Object>} - Result of sending the email
 */
const sendParentNotification = async (email, childName, message) => {
  return sendEmail({
    to: email,
    subject: `Important: Notification about ${childName}'s Social Media Activity`,
    text: `Dear Parent/Guardian,\n\nThis is an important notification regarding ${childName}'s social media activity.\n\n${message}\n\n` +
      `Please log in to your account for more details.\n\n` +
      `Best regards,\nThe Social MH Analyzer Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Important Notification</h2>
        <p>Dear Parent/Guardian,</p>
        <p>This is an important notification regarding ${childName}'s social media activity.</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #ffc107; margin: 15px 0;">
          ${message.replace(/\n/g, '<br>')}
        </div>
        <p>Please log in to your account for more details and to review the activity.</p>
        <div style="margin: 25px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Log In to View Details
          </a>
        </div>
        <p>If you have any questions or concerns, please don't hesitate to contact our support team.</p>
        <p>Best regards,<br>The Social MH Analyzer Team</p>
      </div>
    `,
  });
};

export {
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendParentNotification,
};
