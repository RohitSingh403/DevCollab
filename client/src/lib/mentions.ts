const BOUNDARY = /[\s.,!?;:()[\]{}"']/;

export function mentionAtCursor(value: string, cursor: number) {
  const safe = Math.max(0, Math.min(cursor, value.length));
  const match = value.slice(0, safe).match(/(?:^|\s)@([^\s@]*)$/);
  if (!match) return null;
  const query = match[1] ?? '';
  return { start: safe - query.length - 1, query };
}

export function matchingMembers<T extends { name: string }>(members: T[], query: string) {
  const needle = query.trim().toLowerCase();
  return members
    .filter((member) => member.name.toLowerCase().includes(needle))
    .sort((left, right) => {
      const leftStart = left.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const rightStart = right.name.toLowerCase().startsWith(needle) ? 0 : 1;
      return leftStart - rightStart || left.name.localeCompare(right.name);
    })
    .slice(0, 6);
}

export function commentSegments(body: string, names: string[]) {
  const sorted = names
    .map((name) => name.trim())
    .filter((name) => name.length >= 2)
    .sort((left, right) => right.length - left.length);
  const segments: { text: string; mention: boolean }[] = [];
  let index = 0;
  while (index < body.length) {
    if (body[index] === '@' && (index === 0 || /\s/.test(body[index - 1] ?? ''))) {
      const after = body.slice(index + 1);
      const hit = sorted.find((name) => {
        if (after.slice(0, name.length).toLowerCase() !== name.toLowerCase()) return false;
        const next = after[name.length];
        return !next || BOUNDARY.test(next);
      });
      if (hit) {
        segments.push({ text: body.slice(index, index + 1 + hit.length), mention: true });
        index += 1 + hit.length;
        continue;
      }
    }
    const nextAt = body.indexOf('@', index + 1);
    const end = nextAt === -1 ? body.length : nextAt;
    segments.push({ text: body.slice(index, end), mention: false });
    index = end;
  }
  return segments;
}

export function insertMention(value: string, start: number, cursor: number, name: string) {
  const next = `${value.slice(0, start)}@${name} ${value.slice(cursor)}`;
  const caret = start + name.length + 2;
  return { value: next, caret };
}
