import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: MAX_AGE_MS,
  };
}

function issueToken(user) {
  return jwt.sign({ sub: user._id.toString() }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

/** POST /api/auth/register */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) throw new ApiError(400, 'Name, email and password are required');
  if (String(password).length < 6) throw new ApiError(400, 'Password must be at least 6 characters');

  const exists = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (exists) throw new ApiError(409, 'An account with this email already exists');

  const user = await User.create({
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    password: String(password),
  });

  res.cookie('token', issueToken(user), cookieOptions());
  res.status(201).json({ success: true, user });
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new ApiError(400, 'Email and password are required');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
  if (!user || !(await user.comparePassword(String(password)))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  res.cookie('token', issueToken(user), cookieOptions());
  const safe = user.toJSON();
  delete safe.password;
  res.json({ success: true, user: safe });
});

/** POST /api/auth/logout */
export const logout = asyncHandler(async (req, res) => {
  res.clearCookie('token', { ...cookieOptions(), maxAge: 0 });
  res.json({ success: true, message: 'Logged out' });
});

/** GET /api/auth/me */
export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});

/** PUT /api/auth/profile — name, goals, password change */
export const updateProfile = asyncHandler(async (req, res) => {
  const { name, currentPassword, newPassword, dailyRevisionGoal, dailySolveGoal } = req.body || {};
  const user = await User.findById(req.user._id).select('+password');

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) throw new ApiError(400, 'Name cannot be empty');
    user.name = trimmed;
  }

  if (dailyRevisionGoal !== undefined) {
    user.preferences.dailyRevisionGoal = Math.min(200, Math.max(1, Number(dailyRevisionGoal) || 10));
  }
  if (dailySolveGoal !== undefined) {
    user.preferences.dailySolveGoal = Math.min(100, Math.max(1, Number(dailySolveGoal) || 3));
  }

  if (newPassword) {
    if (!currentPassword) throw new ApiError(400, 'Current password is required');
    if (!(await user.comparePassword(String(currentPassword)))) {
      throw new ApiError(401, 'Current password is incorrect');
    }
    if (String(newPassword).length < 6) throw new ApiError(400, 'New password must be at least 6 characters');
    user.password = String(newPassword);
  }

  await user.save();
  res.json({ success: true, user: user.toJSON() });
});
