import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { parseTzOffset } from '../utils/dates.js';

/** Reads the JWT from the HTTP-only cookie (fallback: Authorization header). */
function readToken(req) {
  if (req.cookies?.token) return req.cookies.token;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Requires a valid JWT and attaches req.user + req.tzOffset. */
export const protect = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
  if (!token) throw new ApiError(401, 'Not authenticated');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ApiError(401, 'Session expired, please log in again');
  }

  const user = await User.findById(payload.sub).select('-password');
  if (!user) throw new ApiError(401, 'Account no longer exists');

  req.user = user;
  req.userId = user._id.toString();
  req.tzOffset = parseTzOffset(req.headers['x-tz-offset']);
  next();
});
