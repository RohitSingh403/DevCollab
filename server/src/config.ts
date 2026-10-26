const nodeEnv = process.env.NODE_ENV ?? 'development';
const configuredOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const clientOrigins = [...configuredOrigins];
if (nodeEnv !== 'production') {
  for (const origin of configuredOrigins) {
    if (origin.includes('localhost')) clientOrigins.push(origin.replace('localhost', '127.0.0.1'));
    if (origin.includes('127.0.0.1')) clientOrigins.push(origin.replace('127.0.0.1', 'localhost'));
  }
}

const cookieSecure = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : clientOrigins.some((origin) => origin.startsWith('https://'));

const cookieSameSiteInput = process.env.COOKIE_SAMESITE ?? (cookieSecure ? 'none' : 'lax');
const cookieSameSite: 'lax' | 'strict' | 'none' =
  cookieSameSiteInput === 'none' || cookieSameSiteInput === 'strict' ? cookieSameSiteInput : 'lax';

if (cookieSameSite === 'none' && !cookieSecure) {
  throw new Error('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
}

const jwtSecret =
  process.env.JWT_SECRET || (nodeEnv === 'production' ? '' : 'dev-only-secret-change-me-now');

if (nodeEnv === 'production' && jwtSecret.length < 24) {
  throw new Error('JWT_SECRET must be set to at least 24 characters in production');
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret,
  clientOrigins: [...new Set(clientOrigins)],
  clientOrigin: clientOrigins[0] ?? 'http://localhost:5173',
  clientDist: process.env.CLIENT_DIST || '',
  cookieSecure,
  cookieSameSite,
  bcryptRounds: nodeEnv === 'test' ? 4 : 12,
  seedOnBoot: process.env.SEED === 'true',
};

export const COOKIE_NAME = 'devcollab_token';

export const cookieOptions: {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: '/';
  maxAge: number;
} = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: env.cookieSameSite,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
