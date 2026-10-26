import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from './errors';

export function parseBody<T>(schema: ZodTypeAny, body: unknown): T {
  try {
    return schema.parse(body) as T;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(400, 'Validation failed', 'validation_error', error.flatten());
    }
    throw error;
  }
}
