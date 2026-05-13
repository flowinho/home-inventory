import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { resolve } from "node:path";
import {
  createBackup,
  getBackupOverview,
  initializeBackupService,
  restoreBackupFile
} from "./backup.js";
import { buildInventoryExport, importInventoryData } from "./exporter.js";
import {
  initializeDatabase,
  insertAndGetId,
  queryAll,
  queryOne,
  runAndPersist,
  touchTimestamp,
  withTransaction
} from "./db.js";
import {
  type DashboardResponse,
  type InventoryItem,
  type ItemWithLocation,
  type RoomSummary,
  type StorageLocationSummary,
  STORAGE_TYPES
} from "../shared/models.js";

const app = express();
const port = Number(process.env.PORT ?? 13337);
const databasePath = process.env.DATABASE_PATH ?? resolve(process.cwd(), "data/inventory.sqlite");
const backupDirectory = process.env.BACKUP_DIRECTORY ?? null;
const clientDistPath = resolve(process.cwd(), "dist/client");

let maintenanceMode = false;

app.use(cors());
app.use(express.json());

app.use("/api", (request, response, next) => {
  if (maintenanceMode) {
    response.status(503).json({
      message: "Die Datenbank wird gerade gewartet. Bitte versuche es gleich erneut."
    });
    return;
  }
  next();
});

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} ist erforderlich.`);
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function requireExpectedUpdatedAt(value: unknown) {
  return requireString(value, "Stand der letzten Änderung");
}

function assertNoConflict(
  changes: number,
  entityName: string,
  currentRow: { updatedAt: string } | null
) {
  if (changes > 0) {
    return;
  }

  if (currentRow) {
    const error = new Error(
      `${entityName} wurde zwischenzeitlich auf einem anderen Gerät geändert. Bitte aktualisiere die Ansicht und versuche es erneut.`
    );
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  const error = new Error(`${entityName} wurde nicht gefunden.`);
  (error as Error & { status?: number }).status = 404;
  throw error;
}

function handleError(response: express.Response, error: unknown) {
  const status =
    typeof error === "object" && error && "status" in error && typeof error.status === "number"
      ? error.status
      : 400;
  response.status(status).json({ message: (error as Error).message });
}

function getRoomById(id: number) {
  return queryOne<RoomSummary>(
    `
      SELECT
        r.*,
        COUNT(DISTINCT sl.id) AS storageCount,
        COUNT(i.id) AS itemCount
      FROM rooms r
      LEFT JOIN storage_locations sl ON sl.roomId = r.id
      LEFT JOIN items i ON i.storageLocationId = sl.id
      WHERE r.id = ?
      GROUP BY r.id
    `,
    [id]
  );
}

function getStorageLocationById(id: number) {
  return queryOne<StorageLocationSummary>(
    `
      SELECT
        sl.*,
        COUNT(i.id) AS itemCount
      FROM storage_locations sl
      LEFT JOIN items i ON i.storageLocationId = sl.id
      WHERE sl.id = ?
      GROUP BY sl.id
    `,
    [id]
  );
}

function getItemById(id: number) {
  return queryOne<ItemWithLocation>(
    `
      SELECT
        i.*,
        sl.name AS storageLocationName,
        sl.type AS storageLocationType,
        sl.roomId AS roomId,
        r.name AS roomName
      FROM items i
      JOIN storage_locations sl ON sl.id = i.storageLocationId
      JOIN rooms r ON r.id = sl.roomId
      WHERE i.id = ?
    `,
    [id]
  );
}

function buildDashboard() {
  const rooms = queryAll<RoomSummary>(
    `
      SELECT
        r.*,
        COUNT(DISTINCT sl.id) AS storageCount,
        COUNT(i.id) AS itemCount
      FROM rooms r
      LEFT JOIN storage_locations sl ON sl.roomId = r.id
      LEFT JOIN items i ON i.storageLocationId = sl.id
      GROUP BY r.id
      ORDER BY r.name COLLATE NOCASE
    `
  );
  const storageLocations = queryAll<StorageLocationSummary>(
    `
      SELECT
        sl.*,
        COUNT(i.id) AS itemCount
      FROM storage_locations sl
      LEFT JOIN items i ON i.storageLocationId = sl.id
      GROUP BY sl.id
      ORDER BY sl.name COLLATE NOCASE
    `
  ).map((storageLocation) => ({
    ...storageLocation,
    previewItems: queryAll<
      Pick<
        InventoryItem,
        "id" | "name" | "quantity" | "unit" | "expirationDate" | "minimumQuantity"
      >
    >(
      `
        SELECT id, name, quantity, unit, expirationDate, minimumQuantity
        FROM items
        WHERE storageLocationId = ?
        ORDER BY updatedAt DESC, name COLLATE NOCASE
        LIMIT 4
      `,
      [storageLocation.id]
    )
  }));
  const items = queryAll<ItemWithLocation>(
    `
      SELECT
        i.*,
        sl.name AS storageLocationName,
        sl.type AS storageLocationType,
        sl.roomId AS roomId,
        r.name AS roomName
      FROM items i
      JOIN storage_locations sl ON sl.id = i.storageLocationId
      JOIN rooms r ON r.id = sl.roomId
      ORDER BY i.name COLLATE NOCASE
    `
  );

  return { rooms, storageLocations, items } satisfies DashboardResponse;
}

function buildAlerts() {
  const items = queryAll<ItemWithLocation>(
    `
      SELECT
        i.*,
        sl.name AS storageLocationName,
        sl.type AS storageLocationType,
        sl.roomId AS roomId,
        r.name AS roomName
      FROM items i
      JOIN storage_locations sl ON sl.id = i.storageLocationId
      JOIN rooms r ON r.id = sl.roomId
    `
  );
  const now = new Date();
  const inSevenDays = new Date(now);
  inSevenDays.setDate(now.getDate() + 7);
  const inThreeDays = new Date(now);
  inThreeDays.setDate(now.getDate() + 3);

  const depleted = items.filter((item) => Number(item.quantity) <= 0);
  const lowStock = items.filter((item) => {
    const min = item.minimumQuantity;
    return typeof min === "number" && min > 0 && Number(item.quantity) <= min;
  });
  const expiringSoon = items.filter((item) => {
    if (!item.expirationDate) {
      return false;
    }
    const date = new Date(item.expirationDate);
    return !Number.isNaN(date.valueOf()) && date >= now && date <= inSevenDays;
  });
  const bddSoon = items.filter((item) => {
    if (!item.expirationDate) {
      return false;
    }
    const date = new Date(item.expirationDate);
    return !Number.isNaN(date.valueOf()) && date >= now && date <= inThreeDays;
  });

  return { depleted, lowStock, expiringSoon, bddSoon };
}

function getBbdSoonItems() {
  return buildAlerts().bddSoon;
}

app.get("/api/meta", (_request, response) => {
  response.json({
    storageTypes: STORAGE_TYPES
  });
});

app.get("/api/dashboard", (_request, response) => {
  response.json(buildDashboard());
});

app.get("/api/alerts", (_request, response) => {
  response.json(buildAlerts());
});

app.get("/api/backups", (_request, response) => {
  response.json(getBackupOverview());
});

app.get("/api/export", (_request, response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="hausbestand-export-${new Date().toISOString().slice(0, 10)}.json"`
  );
  response.json(buildInventoryExport());
});

app.post("/api/backups", async (_request, response) => {
  try {
    const backupPath = await createBackup("manual");
    response.status(201).json({
      message: "Backup wurde erstellt.",
      fileName: basename(backupPath),
      ...getBackupOverview()
    });
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/backups/restore", async (request, response) => {
  try {
    maintenanceMode = true;
    const fileName = requireString(request.body.fileName, "Backup-Datei");
    await restoreBackupFile(fileName);
    response.json({
      message: "Backup wurde erfolgreich zurückgespielt.",
      ...getBackupOverview()
    });
  } catch (error) {
    handleError(response, error);
  } finally {
    maintenanceMode = false;
  }
});

app.post("/api/import", async (request, response) => {
  try {
    maintenanceMode = true;
    await createBackup("before-restore");
    importInventoryData(request.body);
    response.json({
      message: "Daten wurden erfolgreich importiert.",
      ...getBackupOverview()
    });
  } catch (error) {
    handleError(response, error);
  } finally {
    maintenanceMode = false;
  }
});

app.get("/api/search", (request, response) => {
  const rawQuery = typeof request.query.q === "string" ? request.query.q.trim() : "";
  if (!rawQuery) {
    response.json([]);
    return;
  }

  response.json(
    queryAll<ItemWithLocation>(
      `
        SELECT
          i.*,
          sl.name AS storageLocationName,
          sl.type AS storageLocationType,
          sl.roomId AS roomId,
          r.name AS roomName
        FROM items i
        JOIN storage_locations sl ON sl.id = i.storageLocationId
        JOIN rooms r ON r.id = sl.roomId
        WHERE
          i.name LIKE ?
          OR IFNULL(i.category, '') LIKE ?
          OR IFNULL(i.notes, '') LIKE ?
          OR sl.name LIKE ?
          OR r.name LIKE ?
        ORDER BY i.name COLLATE NOCASE
      `,
      Array(5).fill(`%${rawQuery}%`)
    )
  );
});

app.get("/api/rooms", (_request, response) => {
  response.json(buildDashboard().rooms);
});

app.get("/api/rooms/:id", (request, response) => {
  const room = getRoomById(Number(request.params.id));
  if (!room) {
    response.status(404).json({ message: "Raum nicht gefunden." });
    return;
  }

  const storageLocations = queryAll<StorageLocationSummary>(
    `
      SELECT
        sl.*,
        COUNT(i.id) AS itemCount
      FROM storage_locations sl
      LEFT JOIN items i ON i.storageLocationId = sl.id
      WHERE sl.roomId = ?
      GROUP BY sl.id
      ORDER BY sl.name COLLATE NOCASE
    `,
    [Number(request.params.id)]
  );
  response.json({ room, storageLocations });
});

app.post("/api/rooms", (request, response) => {
  try {
    const now = touchTimestamp();
    const id = insertAndGetId(
      `
        INSERT INTO rooms (name, icon, description, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        requireString(request.body.name, "Raumname"),
        normalizeOptionalString(request.body.icon),
        normalizeOptionalString(request.body.description),
        now,
        now
      ]
    );
    response.status(201).json(getRoomById(id));
  } catch (error) {
    handleError(response, error);
  }
});

app.put("/api/rooms/:id", (request, response) => {
  try {
    const roomId = Number(request.params.id);
    const expectedUpdatedAt = requireExpectedUpdatedAt(request.body.expectedUpdatedAt);
    const updatedAt = touchTimestamp();
    const result = runAndPersist(
      `
        UPDATE rooms
        SET name = ?, icon = ?, description = ?, updatedAt = ?
        WHERE id = ? AND updatedAt = ?
      `,
      [
        requireString(request.body.name, "Raumname"),
        normalizeOptionalString(request.body.icon),
        normalizeOptionalString(request.body.description),
        updatedAt,
        roomId,
        expectedUpdatedAt
      ]
    );
    assertNoConflict(result.changes, "Der Raum", queryOne("SELECT updatedAt FROM rooms WHERE id = ?", [roomId]));
    response.json(getRoomById(roomId));
  } catch (error) {
    handleError(response, error);
  }
});

app.delete("/api/rooms/:id", (request, response) => {
  try {
    const roomId = Number(request.params.id);
    const expectedUpdatedAt = requireExpectedUpdatedAt(request.body.expectedUpdatedAt);
    const result = runAndPersist("DELETE FROM rooms WHERE id = ? AND updatedAt = ?", [
      roomId,
      expectedUpdatedAt
    ]);
    assertNoConflict(result.changes, "Der Raum", queryOne("SELECT updatedAt FROM rooms WHERE id = ?", [roomId]));
    response.status(204).send();
  } catch (error) {
    handleError(response, error);
  }
});

app.get("/api/storage-locations", (_request, response) => {
  response.json(buildDashboard().storageLocations);
});

app.get("/api/storage-locations/:id", (request, response) => {
  const storageLocation = getStorageLocationById(Number(request.params.id));
  if (!storageLocation) {
    response.status(404).json({ message: "Aufbewahrungsort nicht gefunden." });
    return;
  }

  const items = queryAll<ItemWithLocation>(
    `
      SELECT
        i.*,
        sl.name AS storageLocationName,
        sl.type AS storageLocationType,
        sl.roomId AS roomId,
        r.name AS roomName
      FROM items i
      JOIN storage_locations sl ON sl.id = i.storageLocationId
      JOIN rooms r ON r.id = sl.roomId
      WHERE i.storageLocationId = ?
      ORDER BY i.name COLLATE NOCASE
    `,
    [Number(request.params.id)]
  );
  response.json({ storageLocation, items });
});

app.post("/api/storage-locations", (request, response) => {
  try {
    const now = touchTimestamp();
    const id = insertAndGetId(
      `
        INSERT INTO storage_locations (roomId, name, type, description, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        Number(request.body.roomId),
        requireString(request.body.name, "Name"),
        requireString(request.body.type, "Typ"),
        normalizeOptionalString(request.body.description),
        now,
        now
      ]
    );
    response.status(201).json(getStorageLocationById(id));
  } catch (error) {
    handleError(response, error);
  }
});

app.put("/api/storage-locations/:id", (request, response) => {
  try {
    const storageLocationId = Number(request.params.id);
    const expectedUpdatedAt = requireExpectedUpdatedAt(request.body.expectedUpdatedAt);
    const updatedAt = touchTimestamp();
    const result = runAndPersist(
      `
        UPDATE storage_locations
        SET roomId = ?, name = ?, type = ?, description = ?, updatedAt = ?
        WHERE id = ? AND updatedAt = ?
      `,
      [
        Number(request.body.roomId),
        requireString(request.body.name, "Name"),
        requireString(request.body.type, "Typ"),
        normalizeOptionalString(request.body.description),
        updatedAt,
        storageLocationId,
        expectedUpdatedAt
      ]
    );
    assertNoConflict(
      result.changes,
      "Der Aufbewahrungsort",
      queryOne("SELECT updatedAt FROM storage_locations WHERE id = ?", [storageLocationId])
    );
    response.json(getStorageLocationById(storageLocationId));
  } catch (error) {
    handleError(response, error);
  }
});

app.delete("/api/storage-locations/:id", (request, response) => {
  try {
    const storageLocationId = Number(request.params.id);
    const expectedUpdatedAt = requireExpectedUpdatedAt(request.body.expectedUpdatedAt);
    const result = runAndPersist(
      "DELETE FROM storage_locations WHERE id = ? AND updatedAt = ?",
      [storageLocationId, expectedUpdatedAt]
    );
    assertNoConflict(
      result.changes,
      "Der Aufbewahrungsort",
      queryOne("SELECT updatedAt FROM storage_locations WHERE id = ?", [storageLocationId])
    );
    response.status(204).send();
  } catch (error) {
    handleError(response, error);
  }
});

app.get("/api/items", (_request, response) => {
  response.json(buildDashboard().items);
});

app.get("/api/items/:id", (request, response) => {
  const item = getItemById(Number(request.params.id));
  if (!item) {
    response.status(404).json({ message: "Gegenstand nicht gefunden." });
    return;
  }

  response.json(item);
});

app.post("/api/items", (request, response) => {
  try {
    const now = touchTimestamp();
    const id = insertAndGetId(
      `
        INSERT INTO items (
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(request.body.storageLocationId),
        requireString(request.body.name, "Name"),
        Number(request.body.quantity ?? 0),
        requireString(request.body.unit, "Einheit"),
        normalizeOptionalString(request.body.category),
        normalizeOptionalNumber(request.body.minimumQuantity),
        normalizeOptionalString(request.body.expirationDate),
        normalizeOptionalString(request.body.notes),
        now,
        now
      ]
    );
    response.status(201).json(getItemById(id));
  } catch (error) {
    handleError(response, error);
  }
});

app.put("/api/items/:id", (request, response) => {
  try {
    const itemId = Number(request.params.id);
    const expectedUpdatedAt = requireExpectedUpdatedAt(request.body.expectedUpdatedAt);
    const updatedAt = touchTimestamp();
    const result = runAndPersist(
      `
        UPDATE items
        SET
          storageLocationId = ?,
          name = ?,
          quantity = ?,
          unit = ?,
          category = ?,
          minimumQuantity = ?,
          expirationDate = ?,
          notes = ?,
          updatedAt = ?
        WHERE id = ? AND updatedAt = ?
      `,
      [
        Number(request.body.storageLocationId),
        requireString(request.body.name, "Name"),
        Number(request.body.quantity ?? 0),
        requireString(request.body.unit, "Einheit"),
        normalizeOptionalString(request.body.category),
        normalizeOptionalNumber(request.body.minimumQuantity),
        normalizeOptionalString(request.body.expirationDate),
        normalizeOptionalString(request.body.notes),
        updatedAt,
        itemId,
        expectedUpdatedAt
      ]
    );
    assertNoConflict(result.changes, "Der Gegenstand", queryOne("SELECT updatedAt FROM items WHERE id = ?", [itemId]));
    response.json(getItemById(itemId));
  } catch (error) {
    handleError(response, error);
  }
});

app.delete("/api/items/:id", (request, response) => {
  try {
    const itemId = Number(request.params.id);
    const expectedUpdatedAt = requireExpectedUpdatedAt(request.body.expectedUpdatedAt);
    const result = runAndPersist("DELETE FROM items WHERE id = ? AND updatedAt = ?", [
      itemId,
      expectedUpdatedAt
    ]);
    assertNoConflict(result.changes, "Der Gegenstand", queryOne("SELECT updatedAt FROM items WHERE id = ?", [itemId]));
    response.status(204).send();
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/items/:id/increase", (request, response) => {
  try {
    const itemId = Number(request.params.id);
    const delta = Math.max(0.1, Number(request.body.amount ?? 1));
    withTransaction(() => {
      const result = runAndPersist(
        `
          UPDATE items
          SET quantity = quantity + ?, updatedAt = ?
          WHERE id = ?
        `,
        [delta, touchTimestamp(), itemId]
      );
      if (result.changes === 0) {
        const error = new Error("Gegenstand nicht gefunden.");
        (error as Error & { status?: number }).status = 404;
        throw error;
      }
    });
    response.json(getItemById(itemId));
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/items/:id/decrease", (request, response) => {
  try {
    const itemId = Number(request.params.id);
    const delta = Math.max(0.1, Number(request.body.amount ?? 1));
    withTransaction(() => {
      const result = runAndPersist(
        `
          UPDATE items
          SET quantity = MAX(quantity - ?, 0), updatedAt = ?
          WHERE id = ?
        `,
        [delta, touchTimestamp(), itemId]
      );
      if (result.changes === 0) {
        const error = new Error("Gegenstand nicht gefunden.");
        (error as Error & { status?: number }).status = 404;
        throw error;
      }
    });
    response.json(getItemById(itemId));
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/items/:id/move", (request, response) => {
  try {
    const itemId = Number(request.params.id);
    withTransaction(() => {
      const result = runAndPersist(
        `
          UPDATE items
          SET storageLocationId = ?, updatedAt = ?
          WHERE id = ?
        `,
        [Number(request.body.storageLocationId), touchTimestamp(), itemId]
      );
      if (result.changes === 0) {
        const error = new Error("Gegenstand nicht gefunden.");
        (error as Error & { status?: number }).status = 404;
        throw error;
      }
    });
    response.json(getItemById(itemId));
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/items/:id/consume", (request, response) => {
  try {
    const itemId = Number(request.params.id);
    withTransaction(() => {
      const result = runAndPersist(
        `
          UPDATE items
          SET quantity = 0, updatedAt = ?
          WHERE id = ?
        `,
        [touchTimestamp(), itemId]
      );
      if (result.changes === 0) {
        const error = new Error("Gegenstand nicht gefunden.");
        (error as Error & { status?: number }).status = 404;
        throw error;
      }
    });
    response.json(getItemById(itemId));
  } catch (error) {
    handleError(response, error);
  }
});

async function start() {
  await initializeDatabase(databasePath);
  initializeBackupService(databasePath, backupDirectory);

  if (existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get(/^(?!\/api).*/, (_request, response) => {
      response.sendFile(resolve(clientDistPath, "index.html"));
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`Hausbestand läuft auf Port ${port}`);
  });
}

start().catch((error) => {
  console.error("Start fehlgeschlagen", error);
  process.exit(1);
});
