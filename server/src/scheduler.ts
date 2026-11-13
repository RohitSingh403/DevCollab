import { logger } from './logger';
import { closeFinishedCycles } from './services/cycles';
import { scanDueReminders } from './services/reminders';

const HOUR_MS = 60 * 60 * 1000;

export async function runMaintenance(now = new Date()) {
  await closeFinishedCycles(now);
  await scanDueReminders(now);
}

export function startScheduler() {
  const run = () => {
    void runMaintenance().catch((error: unknown) => logger.error('Scheduled check failed', error));
  };
  const timer = setInterval(run, HOUR_MS);
  timer.unref();
  run();
}
