import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { COOKIE_NAME, cookieOptions, env } from '../config';
import { asyncHandler } from '../asyncHandler';
import { ApiError } from '../errors';
import { requireAuth, signToken, toAuthUser } from '../middleware/auth';
import { User } from '../models/User';
import { loginSchema, registerSchema, updateProfileSchema } from '../schemas';
import { serializeUser } from '../serializers';
import { provisionStarter } from '../services/starter';
import { colorFromString } from '../utils';
import { parseBody } from '../validate';

export const authRouter = Router();

if (env.nodeEnv !== 'test') {
  authRouter.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { message: 'Too many attempts. Try again later.', code: 'rate_limited' } },
    }),
  );
}

function sendSession(res: import('express').Response, user: { _id: unknown; name: string; email: string; avatarColor: string }) {
  const token = signToken(String(user._id));
  res.cookie(COOKIE_NAME, token, cookieOptions);
  return serializeUser(user);
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof registerSchema.parse>>(registerSchema, req.body);
    const existing = await User.findOne({ email: input.email }).lean();
    if (existing) throw new ApiError(409, 'An account with that email already exists', 'email_taken');
    const passwordHash = await bcrypt.hash(input.password, env.bcryptRounds);
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      avatarColor: colorFromString(input.email),
    });
    try {
      await provisionStarter({ id: String(user._id), name: user.name });
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }
    res.status(201).json({ user: sendSession(res, user) });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof loginSchema.parse>>(loginSchema, req.body);
    const user = await User.findOne({ email: input.email }).select('+passwordHash');
    const matches = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !matches) throw new ApiError(401, 'Email or password is incorrect', 'invalid_credentials');
    res.json({ user: sendSession(res, user) });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, {
    path: cookieOptions.path,
    sameSite: cookieOptions.sameSite,
    secure: cookieOptions.secure,
    httpOnly: true,
  });
  res.status(204).send();
});

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.authUser });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof updateProfileSchema.parse>>(updateProfileSchema, req.body);
    const user = await User.findByIdAndUpdate(req.authUser!.id, { name: input.name }, { new: true }).lean();
    if (!user) throw new ApiError(401, 'Invalid session', 'unauthorized');
    const authUser = toAuthUser(user);
    req.authUser = authUser;
    res.json({ user: serializeUser(user) });
  }),
);
