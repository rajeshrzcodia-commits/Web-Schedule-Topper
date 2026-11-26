const express = require('express');
const router = express.Router();
const User = require('../models/User');
const {
  requireAuth,
  generateToken,
  hashPassword,
  verifyPassword,
} = require('../middleware/authMiddleware');
const { config } = require('../config/env');
const { createLogger } = require('../config/logger');

const logger = createLogger('auth');

const serializeUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  authProvider: user.authProvider,
  hasPassword: Boolean(user.passwordHash),
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = hashPassword(password);

    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      authProvider: 'local',
    });

    await user.save();

    const token = generateToken(user._id.toString(), user.tokenVersion || 0);

    return res.status(201).json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    logger.error(`Register error: ${error.message}`);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    return res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).lean();
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.passwordHash) {
      return res.status(401).json({
        error: 'This account uses Google sign-in and does not have a password. Continue with Google.',
      });
    }
    if (!verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user._id.toString(), user.tokenVersion || 0);

    return res.status(200).json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    return res.status(500).json({ error: error.message || 'Login failed' });
  }
});

// POST /api/auth/google
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    if (!config.googleClientId) {
      return res.status(503).json({ error: 'Google Sign-In is not configured on the server.' });
    }

    let tokenInfo;
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
      );
      if (!response.ok) {
        throw new Error(`Google tokeninfo returned ${response.status}`);
      }
      tokenInfo = await response.json();
    } catch (error) {
      logger.error(`Google token verification failed: ${error.message}`);
      return res.status(400).json({ error: 'Google ID token verification failed' });
    }

    if (config.googleClientId && tokenInfo.aud !== config.googleClientId) {
      return res.status(400).json({ error: 'Google token audience mismatch' });
    }

    if (tokenInfo.email_verified !== true && tokenInfo.email_verified !== 'true') {
      return res.status(400).json({ error: 'Google account email must be verified' });
    }

    if (typeof tokenInfo.sub !== 'string' || !tokenInfo.sub.trim()) {
      return res.status(400).json({ error: 'Google token is missing a valid subject' });
    }

    const googleId = tokenInfo.sub.trim();
    const email = (tokenInfo.email || '').toLowerCase().trim();
    const name = tokenInfo.name || email.split('@')[0] || 'Google User';

    if (!email) {
      return res.status(400).json({ error: 'Google account has no email' });
    }

    let user = await User.findOne({ googleId }).lean();
    if (!user) {
      user = await User.findOne({ email }).lean();
    }

    if (!user) {
      user = new User({
        name,
        email,
        authProvider: 'google',
        googleId,
        passwordHash: '',
      });
      await user.save();
      user = user.toObject ? user.toObject() : user;
    } else if (user.authProvider === 'local' && !user.googleId) {
      user.googleId = googleId;
      user.authProvider = 'google';
      await User.findByIdAndUpdate(user._id, {
        googleId,
        authProvider: 'google',
      });
      user = await User.findById(user._id).lean();
    }

    const token = generateToken(user._id.toString(), user.tokenVersion || 0);

    return res.status(200).json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    logger.error(`Google auth error: ${error.message}`);
    return res.status(500).json({ error: error.message || 'Google authentication failed' });
  }
});

// GET /api/auth/me (protected)
router.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({ user: req.user });
});

// PUT /api/auth/profile (protected)
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    const updates = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Name must be a non-empty string' });
      }
      updates.name = name.trim();
    }

    if (newPassword !== undefined && newPassword !== null) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        return res.status(400).json({ error: 'Current password is required to change password' });
      }
      if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }

      const user = await User.findById(req.user.id).lean();
      if (!user || !user.passwordHash) {
        return res.status(400).json({ error: 'No local password set for this account' });
      }
      const valid = verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      updates.passwordHash = hashPassword(newPassword);
    }

    const updated = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      lean: true,
    });

    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      user: {
        id: updated._id.toString(),
        name: updated.name,
        email: updated.email,
        authProvider: updated.authProvider,
        hasPassword: Boolean(updated.passwordHash),
      },
    });
  } catch (error) {
    logger.error(`Profile update error: ${error.message}`);
    return res.status(500).json({ error: error.message || 'Profile update failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });
    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error(`Logout error: ${error.message}`);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;

