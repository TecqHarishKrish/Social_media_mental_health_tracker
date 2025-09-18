import express from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { sendEmail } from '../utils/mailer.js';

const router = express.Router();

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
router.post(
  '/register',
  [
    body('name', 'Name is required').notEmpty(),
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Please enter a password with 8 or more characters').isLength({ min: 8 }),
    body('dob', 'Date of birth is required').isISO8601(),
    body('consent', 'You must agree to the terms and privacy policy').equals('true'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, dob, phone, parentPhone } = req.body;

    try {
      // Check if user already exists
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({ errors: [{ msg: 'User already exists' }] });
      }

      // Calculate if user is under 18
      const birthDate = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      const isUnder18 = age < 18;

      // If user is under 18, require parent phone
      if (isUnder18 && !parentPhone) {
        return res.status(400).json({
          errors: [{ msg: 'Parent/guardian phone number is required for users under 18' }],
        });
      }

      // Create new user
      user = new User({
        name,
        email,
        password,
        dob: birthDate,
        phone,
        parentPhone: isUnder18 ? parentPhone : undefined,
        isUnder18,
        consent: true,
      });

      await user.save();

      // Generate token
      const token = generateToken(user._id);

      // Send welcome email
      try {
        await sendEmail({
          to: user.email,
          subject: 'Welcome to Social MH Analyzer',
          text: `Hi ${user.name},\n\nThank you for registering with Social MH Analyzer. We're excited to help you track and understand your social media habits and mental well-being.\n\nBest regards,\nThe Social MH Analyzer Team`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Welcome to Social MH Analyzer, ${user.name}!</h2>
              <p>Thank you for registering with Social MH Analyzer. We're excited to help you track and understand your social media habits and mental well-being.</p>
              <p>Start by connecting your social media accounts or uploading your data to get personalized insights.</p>
              <p>Best regards,<br>The Social MH Analyzer Team</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail the registration if email fails
      }

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isUnder18: user.isUnder18,
        token,
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
router.post(
  '/login',
  [
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Password is required').exists(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Check if user exists
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
      }

      // Check if account is active
      if (user.accountStatus === 'suspended') {
        return res.status(403).json({ errors: [{ msg: 'Account suspended. Please contact support.' }] });
      }

      if (user.accountStatus === 'deleted') {
        return res.status(403).json({ errors: [{ msg: 'Account not found' }] });
      }

      // Check password
      const isMatch = await user.comparePassword(password);

      if (!isMatch) {
        return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate token
      const token = generateToken(user._id);

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isUnder18: user.isUnder18,
        token,
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
router.get('/me', async (req, res) => {
  try {
    // Get token from header
    const token = req.header('x-auth-token');

    if (!token) {
      return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from the token
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error(err.message);
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ msg: 'Token is not valid' });
    }
    res.status(500).send('Server Error');
  }
});

// @desc    Delete user account
// @route   DELETE /api/auth/delete
// @access  Private
router.delete('/delete', async (req, res) => {
  try {
    // Get token from header
    const token = req.header('x-auth-token');

    if (!token) {
      return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    // Verify token and get user ID
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Find user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Instead of deleting, mark as deleted for data retention
    user.accountStatus = 'deleted';
    user.email = `deleted-${Date.now()}-${user.email}`; // Anonymize email
    user.phone = '';
    user.parentPhone = '';
    user.name = 'Deleted User';
    user.dob = new Date('2000-01-01');
    
    // In a real app, you would also need to handle related data (posts, analyses, etc.)
    // This is a simplified version
    
    await user.save();

    res.json({ msg: 'Account deleted successfully' });
  } catch (err) {
    console.error(err.message);
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ msg: 'Token is not valid' });
    }
    res.status(500).send('Server Error');
  }
});

// @desc    Request password reset
// @route   POST /api/auth/forgot-password
// @access  Public
router.post(
  '/forgot-password',
  [body('email', 'Please include a valid email').isEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    try {
      const user = await User.findOne({ email });

      if (!user) {
        // For security, don't reveal if the email exists or not
        return res.json({ msg: 'If an account exists with this email, a password reset link has been sent' });
      }

      // Generate reset token
      const resetToken = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET + user.password,
        { expiresIn: '1h' }
      );

      // In a real app, you would send an email with a link containing this token
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&id=${user._id}`;

      try {
        await sendEmail({
          to: user.email,
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
              <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
              <p>Best regards,<br>The Social MH Analyzer Team</p>
            </div>
          `,
        });

        res.json({ msg: 'If an account exists with this email, a password reset link has been sent' });
      } catch (err) {
        console.error('Error sending password reset email:', err);
        return res.status(500).json({ msg: 'Error sending email. Please try again later.' });
      }
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @desc    Reset password
// @route   PUT /api/auth/reset-password
// @access  Public
router.put(
  '/reset-password',
  [
    body('password', 'Please enter a password with 8 or more characters').isLength({ min: 8 }),
    body('token', 'Token is required').notEmpty(),
    body('userId', 'User ID is required').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password, token, userId } = req.body;

    try {
      const user = await User.findById(userId);

      if (!user) {
        return res.status(400).json({ msg: 'Invalid or expired token' });
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET + user.password);

      // Update password
      user.password = password;
      await user.save();

      // Send confirmation email
      try {
        await sendEmail({
          to: user.email,
          subject: 'Password Updated Successfully',
          text: `Your password has been successfully updated.\n\n` +
            `If you did not make this change, please contact support immediately.`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Password Updated Successfully</h2>
              <p>Your password has been successfully updated.</p>
              <p>If you did not make this change, please contact support immediately.</p>
              <p>Best regards,<br>The Social MH Analyzer Team</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Failed to send password update confirmation email:', emailError);
        // Don't fail the password reset if email fails
      }

      res.json({ msg: 'Password updated successfully' });
    } catch (err) {
      console.error(err.message);
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(400).json({ msg: 'Invalid or expired token' });
      }
      res.status(500).send('Server error');
    }
  }
);

// Middleware to protect routes
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');

      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ msg: 'Not authorized' });
    }
  }

  if (!token) {
    res.status(401).json({ msg: 'Not authorized, no token' });
  }
};

export { router as authRoutes, protect };
