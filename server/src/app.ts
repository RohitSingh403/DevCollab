import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import fs from 'fs';
import mongoose from 'mongoose';
import { env } from './config';
import { errorHandler, notFoundApi } from './middleware/error';
import { authRouter } from './routes/auth';
import { commentRouter, issueRouter } from './routes/issues';
import { notificationRouter } from './routes/notifications';
import { projectRouter, workspaceProjectRouter } from './routes/projects';
import { inviteRouter, workspaceRouter } from './routes/workspaces';
import { registerSocket } from './socket';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.clientOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  if (env.nodeEnv !== 'test') {
    const apiLimiter = rateLimit({
      windowMs: 60_000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { message: 'Too many requests. Slow down.', code: 'rate_limited' } },
    });
    app.use('/api', (req, res, next) => {
      if (req.path === '/api/health' || req.path === '/health') {
        next();
        return;
      }
      apiLimiter(req, res, next);
    });
  }

  app.get('/api/health', (_req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({ ok: connected, db: connected ? 'connected' : 'disconnected' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/workspaces', workspaceRouter);
  app.use('/api/workspaces/:workspaceId/projects', workspaceProjectRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/issues', issueRouter);
  app.use('/api/comments', commentRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/invites', inviteRouter);
  app.use('/api', notFoundApi);
  app.use(errorHandler);
  return app;
}

export function clientDistPath() {
  if (env.clientDist) return path.resolve(env.clientDist);
  return path.resolve(__dirname, '../../client/dist');
}

export function attachClient(app: express.Express) {
  if (env.nodeEnv === 'test') return;
  const dist = clientDistPath();
  if (!fs.existsSync(path.join(dist, 'index.html'))) return;
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.sendFile(path.join(dist, 'index.html'));
  });
}

export function createHttpServer() {
  const app = createApp();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: env.clientOrigins, credentials: true },
  });
  registerSocket(io);
  app.set('io', io);
  attachClient(app);
  return { app, httpServer, io };
}
