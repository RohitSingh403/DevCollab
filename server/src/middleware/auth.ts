import { randomBytes } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { COOKIE_NAME, env } from '../config';
import { ApiError } from '../errors';
import { asyncHandler } from '../asyncHandler';
import { User } from '../models/User';
import type { AuthUser } from '../types/express';

const MAX_SESSIONS = 8;

export function newSessionId() {
  return randomBytes(16).toString('hex');
}

export function signToken(userId: string, sid: string) {
  return jwt.sign({ sub: userId, sid }, env.jwtSecret, { expiresIn: '7d', algorithm: 'HS256' });
}

export function readToken(req: Request) {
  const header = req.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const cookie = req.cookies?.[COOKIE_NAME];
  return typeof cookie === 'string' ? cookie : undefined;
}

export function readSession(token: string) {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub || typeof payload.sid !== 'string' || !payload.sid) return null;
    return { userId: String(payload.sub), sid: payload.sid };
  } catch {
    return null;
  }
}

export function rememberSession(sessions: { sid: string; createdAt: Date }[] | null | undefined, sid: string) {
  const next = (sessions ?? []).filter((row) => row.sid !== sid).slice(-(MAX_SESSIONS - 1));
  next.push({ sid, createdAt: new Date() });
  return next;
}

export async function userFromToken(token: string) {
  const session = readSession(token);
  if (!session) return null;
  const user = await User.findById(session.userId).select('name email avatarColor sessions');
  if (!user) return null;
  if (!user.sessions?.some((row) => row.sid === session.sid)) return null;
  return user;
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
  const user = await userFromToken(token);
  if (!user) throw new ApiError(401, 'Invalid session', 'unauthorized');
  req.authUser = toAuthUser(user);
  next();
});
