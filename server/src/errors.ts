export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isDuplicateKey(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 11000;
}
