import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError, isDuplicateKey } from '../errors';
import { logger } from '../logger';

export function notFoundApi(_req: Request, res: Response) {
  res.status(404).json({ error: { message: 'Not found', code: 'not_found' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { message: err.message, code: err.code, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { message: 'Validation failed', code: 'validation_error', details: err.flatten() },
    });
    return;
  }

  if (isDuplicateKey(err)) {
    res.status(409).json({ error: { message: 'That value is already in use', code: 'duplicate' } });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { message: 'Malformed JSON body', code: 'bad_json' } });
    return;
  }

  const mongoName = typeof err === 'object' && err && 'name' in err ? String((err as { name: string }).name) : '';
  if (mongoName === 'CastError') {
    res.status(400).json({ error: { message: 'Invalid id', code: 'invalid_id' } });
    return;
  }

  logger.error('Unhandled error', err);
  res.status(500).json({ error: { message: 'Something went wrong', code: 'internal_error' } });
}
