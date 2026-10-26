import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { COOKIE_NAME, env } from '../config';
import { ApiError } from '../errors';
import { asyncHandler } from '../asyncHandler';
import { User } from '../models/User';
import type { AuthUser } from '../types/express';

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: '7d' });
}

export function readToken(req: Request) {
  const header = req.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const cookie = req.cookies?.[COOKIE_NAME];
  return typeof cookie === 'string' ? cookie : undefined;
}

export function verifyToken(token: string) {
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (typeof payload === 'string' || !payload.sub) return null;
    return String(payload.sub);
  } catch {
    return null;
  }
}

export function toAuthUser(user: { _id: unknown; name: string; email: string; avatarColor: string }): AuthUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    avatarColor: user.avatarColor,
  };
}

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = readToken(req);
  if (!token) throw new ApiError(401, 'Authentication required', 'unauthorized');
  const userId = verifyToken(token);
  if (!userId) throw new ApiError(401, 'Invalid session', 'unauthorized');
  const user = await User.findById(userId).lean();
  if (!user) throw new ApiError(401, 'Invalid session', 'unauthorized');
  req.authUser = toAuthUser(user);
  next();
});
