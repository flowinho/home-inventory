import { writeFileSync } from "node:fs";
import { queryAll, runAndPersist, touchTimestamp, withTransaction } from "./db.js";
import type { InventoryExportData, InventoryItem, Room, StorageLocation } from "../shared/models.js";

const EXPORT_VERSION = 1;

export function buildInventoryExport(): InventoryExportData {
  return {
    version: EXPORT_VERSION,
    exportedAt: touchTimestamp(),
    rooms: queryAll<Room>("SELECT * FROM rooms ORDER BY id"),
    storageLocations: queryAll<StorageLocation>("SELECT * FROM storage_locations ORDER BY id"),
    items: queryAll<InventoryItem>("SELECT * FROM items ORDER BY id")
  };
}

export function writeInventoryExportFile(destinationFile: string) {
  const exportData = buildInventoryExport();
  writeFileSync(destinationFile, JSON.stringify(exportData, null, 2), "utf8");
  return exportData;
}

function validateImportData(data: unknown): InventoryExportData {
  if (typeof data !== "object" || data === null) {
    throw new Error("Importdatei ist ungültig.");
  }

  const parsed = data as Partial<InventoryExportData>;
  if (!Array.isArray(parsed.rooms) || !Array.isArray(parsed.storageLocations) || !Array.isArray(parsed.items)) {
    throw new Error("Importdatei enthält keine gültigen Bestandsdaten.");
  }

  return {
    version: typeof parsed.version === "number" ? parsed.version : EXPORT_VERSION,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : touchTimestamp(),
    rooms: parsed.rooms as Room[],
    storageLocations: parsed.storageLocations as StorageLocation[],
    items: parsed.items as InventoryItem[]
  };
}

export function importInventoryData(data: unknown) {
  const parsed = validateImportData(data);

  withTransaction(() => {
    runAndPersist("DELETE FROM items");
    runAndPersist("DELETE FROM storage_locations");
    runAndPersist("DELETE FROM rooms");

    for (const room of parsed.rooms) {
      runAndPersist(
        `
          INSERT INTO rooms (id, name, description, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?)
        `,
        [room.id, room.name, room.description, room.createdAt, room.updatedAt]
      );
    }

    for (const storageLocation of parsed.storageLocations) {
      runAndPersist(
        `
          INSERT INTO storage_locations (id, roomId, name, type, description, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          storageLocation.id,
          storageLocation.roomId,
          storageLocation.name,
          storageLocation.type,
          storageLocation.description,
          storageLocation.createdAt,
          storageLocation.updatedAt
        ]
      );
    }

    for (const item of parsed.items) {
      runAndPersist(
        `
          INSERT INTO items (
            id,
            storageLocationId,
            name,
            quantity,
            unit,
            category,
            minimumQuantity,
            expirationDate,
            notes,
            createdAt,
            updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          item.id,
          item.storageLocationId,
          item.name,
          item.quantity,
          item.unit,
          item.category,
          item.minimumQuantity,
          item.expirationDate,
          item.notes,
          item.createdAt,
          item.updatedAt
        ]
      );
    }

    const maxRoomId = parsed.rooms.reduce((max, room) => Math.max(max, room.id), 0);
    const maxStorageLocationId = parsed.storageLocations.reduce(
      (max, storageLocation) => Math.max(max, storageLocation.id),
      0
    );
    const maxItemId = parsed.items.reduce((max, item) => Math.max(max, item.id), 0);

    runAndPersist("DELETE FROM sqlite_sequence WHERE name IN ('rooms', 'storage_locations', 'items')");
    runAndPersist("INSERT INTO sqlite_sequence (name, seq) VALUES ('rooms', ?)", [maxRoomId]);
    runAndPersist("INSERT INTO sqlite_sequence (name, seq) VALUES ('storage_locations', ?)", [
      maxStorageLocationId
    ]);
    runAndPersist("INSERT INTO sqlite_sequence (name, seq) VALUES ('items', ?)", [maxItemId]);
  });

  return parsed;
}
