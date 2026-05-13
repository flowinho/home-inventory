import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  rmSync,
  unlinkSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  checkpointDatabase,
  closeDatabase,
  createBackupFile,
  getDatabasePath,
  initializeDatabase
} from "./db.js";
import type { BackupFileInfo, BackupOverview } from "../shared/models.js";

const DEFAULT_BACKUP_TIME = "03:15";
const DEFAULT_RETENTION_DAYS = 14;

let backupDirectory = "";
let nextAutomaticBackupAt: string | null = null;
let automaticBackupTimer: NodeJS.Timeout | null = null;
let automaticBackupTime = DEFAULT_BACKUP_TIME;
let retentionDays = DEFAULT_RETENTION_DAYS;

function ensureDirectory(path: string) {
  mkdirSync(path, { recursive: true });
}

function parseTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return { hours: 3, minutes: 15 };
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2])
  };
}

function buildBackupFileName(date: Date) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ];
  return `inventory-backup-${parts.join("")}.sqlite`;
}

function getNextRunDate(now: Date, timeValue: string) {
  const { hours, minutes } = parseTime(timeValue);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getBackupDirectoryPath() {
  return backupDirectory;
}

function sortBackups(backups: BackupFileInfo[]) {
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listBackups(): BackupFileInfo[] {
  ensureDirectory(getBackupDirectoryPath());
  const files = readdirSync(getBackupDirectoryPath(), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sqlite"))
    .map((entry) => {
      const fullPath = join(getBackupDirectoryPath(), entry.name);
      const stat = statSync(fullPath);
      return {
        fileName: entry.name,
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size
      } satisfies BackupFileInfo;
    });

  return sortBackups(files);
}

function pruneOldBackups() {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const backup of listBackups()) {
    if (new Date(backup.createdAt).getTime() < cutoff) {
      unlinkSync(join(getBackupDirectoryPath(), backup.fileName));
    }
  }
}

export async function createBackup(reason: "manual" | "automatic" | "before-restore" = "manual") {
  ensureDirectory(getBackupDirectoryPath());
  checkpointDatabase();
  const suffix = reason === "manual" ? "" : `-${reason}`;
  const fileName = buildBackupFileName(new Date()).replace(".sqlite", `${suffix}.sqlite`);
  const destination = join(getBackupDirectoryPath(), fileName);
  await createBackupFile(destination);
  pruneOldBackups();
  return destination;
}

export async function restoreBackupFile(fileName: string) {
  const safeName = basename(fileName);
  const source = join(getBackupDirectoryPath(), safeName);
  if (!existsSync(source)) {
    const error = new Error("Backup-Datei nicht gefunden.");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  const databasePath = getDatabasePath();
  const tempPath = `${databasePath}.restore-tmp`;
  const walPath = `${databasePath}-wal`;
  const shmPath = `${databasePath}-shm`;

  await createBackup("before-restore");
  closeDatabase();
  rmSync(walPath, { force: true });
  rmSync(shmPath, { force: true });
  copyFileSync(source, tempPath);
  renameSync(tempPath, databasePath);
  await initializeDatabase(databasePath);
}

function scheduleNextAutomaticBackup() {
  if (automaticBackupTimer) {
    clearTimeout(automaticBackupTimer);
  }

  const nextRun = getNextRunDate(new Date(), automaticBackupTime);
  nextAutomaticBackupAt = nextRun.toISOString();
  automaticBackupTimer = setTimeout(async () => {
    try {
      await createBackup("automatic");
    } finally {
      scheduleNextAutomaticBackup();
    }
  }, Math.max(1000, nextRun.getTime() - Date.now()));
}

export function initializeBackupService(databasePath: string, configuredBackupDirectory?: string | null) {
  backupDirectory =
    configuredBackupDirectory && configuredBackupDirectory.trim().length > 0
      ? resolve(configuredBackupDirectory)
      : resolve(dirname(databasePath), "backups");
  automaticBackupTime = process.env.BACKUP_TIME?.trim() || DEFAULT_BACKUP_TIME;
  const configuredRetentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  retentionDays = Number.isFinite(configuredRetentionDays) && configuredRetentionDays > 0
    ? Math.floor(configuredRetentionDays)
    : DEFAULT_RETENTION_DAYS;
  ensureDirectory(backupDirectory);
  pruneOldBackups();
  scheduleNextAutomaticBackup();
}

export function getBackupOverview(): BackupOverview {
  return {
    backups: listBackups(),
    backupDirectory: getBackupDirectoryPath(),
    nextAutomaticBackupAt,
    automaticBackupTime
  };
}
