export const logger = {
  info(message: string, extra?: unknown) {
    if (process.env.NODE_ENV === 'test') return;
    if (extra === undefined) console.log(message);
    else console.log(message, extra);
  },
  error(message: string, extra?: unknown) {
    if (extra === undefined) console.error(message);
    else console.error(message, extra);
  },
};
