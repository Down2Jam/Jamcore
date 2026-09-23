import db from "../infra/db.js";
import { runCurrentJamRatingReminderCatchup } from "../features/notifications/rating-reminders.js";

try {
  const jamId = await runCurrentJamRatingReminderCatchup();
  console.info(`Halfway rating reminders delivered for jam ${jamId}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
