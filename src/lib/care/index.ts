// ── Care Engine: Public API ───────────────────────────────────────

export {
  startCareEngine,
  stopCareEngine,
  isCareEngineRunning,
  reloadCareSettings,
  getCareSettings,
  saveCareSettings,
  onCareNotification,
  addWhisperReminder,
  type CareNotification,
} from "./engine";

export {
  REMINDER_TYPES,
  DEFAULT_CARE_SETTINGS,
  type ReminderType,
  type ReminderTone,
  type CareSettings,
  type ReminderConfig,
  type ScheduledReminder,
} from "./reminders";

export { parseWhispers, scheduleWhispers, fireImmediateWhispers } from "./whisper";

export {
  createAftercareState,
  recordMessage,
  checkAftercare,
  resetAftercare,
  type AftercareState,
  type AftercareNotification,
  type AftercareAction,
} from "./aftercare";

export {
  pushNotification,
  dismissNotification,
  clearAllNotifications,
  setNotificationUpdateCallback,
  clearNotificationUpdateCallback,
  type VisibleNotification,
} from "./notifications";

export { getVariedText } from "./varied-text";

export {
  pushWhisper,
  dismissWhisper,
  onWhisperEvent,
  getWhisperHistory,
  getVisibleWhispers,
  clearWhispers,
} from "./whisper-manager";

export {
  loadAmbientSettings,
  saveAmbientSettings,
  getAmbientSettings,
  resetAmbientSession,
  ambientWhisperTick,
  DEFAULT_AMBIENT_SETTINGS,
  type AmbientFrequency,
  type AmbientWhisperSettings,
} from "./ambient-whisper";
