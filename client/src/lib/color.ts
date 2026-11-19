import { LABEL_COLORS } from './types';

export function colorForKey(key: string) {
  let sum = 0;
  for (const char of key.toUpperCase()) sum += char.charCodeAt(0);
  return LABEL_COLORS[sum % LABEL_COLORS.length];
}
