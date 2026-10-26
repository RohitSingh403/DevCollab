import { createHash, randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { ApiError } from './errors';

const AVATAR_COLORS = ['#e7f56a', '#5ee0b5', '#8eb6ff', '#f0b429', '#ff6b81', '#d4bfff', '#ff9f68', '#5ccfe6'];

export function colorFromString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function slugify(input: string) {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return base || 'workspace';
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function assertObjectId(id: string, label = 'id') {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, `Invalid ${label}`, 'invalid_id');
  }
}

export function newInviteToken() {
  const token = randomBytes(24).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

export function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function pageMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

export function asId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '_id' in value && (value as { _id?: unknown })._id != null) {
    return String((value as { _id: unknown })._id);
  }
  if (value && typeof value === 'object' && 'toString' in value) return String(value);
  return '';
}
