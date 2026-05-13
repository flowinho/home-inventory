export const STORAGE_TYPES = [
  "Kühlschrank",
  "Gefrierschrank",
  "Schrank",
  "Hängeschrank",
  "Regal",
  "Box",
  "Schublade",
  "Sonstiges"
] as const;

export const ITEM_UNITS = [
  "Stück",
  "Packung",
  "Flasche",
  "Glas",
  "Dose",
  "Beutel",
  "kg",
  "g",
  "l",
  "ml"
] as const;

export type StorageType = (typeof STORAGE_TYPES)[number];
export type ItemUnit = (typeof ITEM_UNITS)[number];

export type ThemeMode = "light" | "dark";

export interface Room {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StorageLocation {
  id: number;
  roomId: number;
  name: string;
  type: StorageType;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: number;
  storageLocationId: number;
  name: string;
  quantity: number;
  unit: string;
  category: string | null;
  minimumQuantity: number | null;
  expirationDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoomSummary extends Room {
  storageCount: number;
  itemCount: number;
}

export interface StorageLocationSummary extends StorageLocation {
  itemCount: number;
  previewItems: Pick<
    InventoryItem,
    "id" | "name" | "quantity" | "unit" | "expirationDate" | "minimumQuantity"
  >[];
}

export interface ItemWithLocation extends InventoryItem {
  storageLocationName: string;
  storageLocationType: StorageType;
  roomId: number;
  roomName: string;
}

export interface DashboardResponse {
  rooms: RoomSummary[];
  storageLocations: StorageLocationSummary[];
  items: ItemWithLocation[];
}

export interface AlertOverview {
  lowStock: ItemWithLocation[];
  expiringSoon: ItemWithLocation[];
  depleted: ItemWithLocation[];
}

export interface BackupFileInfo {
  fileName: string;
  createdAt: string;
  sizeBytes: number;
}

export interface BackupOverview {
  backups: BackupFileInfo[];
  exports: BackupFileInfo[];
  backupDirectory: string;
  nextAutomaticBackupAt: string | null;
  automaticBackupTime: string;
}

export interface InventoryExportData {
  version: number;
  exportedAt: string;
  rooms: Room[];
  storageLocations: StorageLocation[];
  items: InventoryItem[];
}
