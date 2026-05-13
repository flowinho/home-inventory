# Hausbestand

Hausbestand ist eine lokale, deutschsprachige Web-App zur Verwaltung von Haushaltsinventar. Räume, Aufbewahrungsorte und Gegenstände können schnell erfasst, bearbeitet, verschoben, verbraucht und gelöscht werden. Die Anwendung ist für den Selbstbetrieb per Docker Compose gedacht und läuft ohne Cloud, ohne externe APIs und ohne Internetzugriff zur Laufzeit.

## Funktionen

- Räume verwalten, zum Beispiel `Küche`, `Keller`, `Bad` oder `Garage`
- Aufbewahrungsorte pro Raum verwalten, zum Beispiel `Kühlschrank`, `Regal` oder `Schublade`
- Gegenstände mit Menge, Einheit, Kategorie, Mindestmenge, Ablaufdatum und Notizen pflegen
- Schnelle Mengenänderung mit `+` und `-`
- Gegenstände direkt entnehmen, verschieben oder löschen
- Globale Suche nach Gegenständen
- Übersichten für `Niedriger Bestand`, `Bald ablaufend` und `Aufgebraucht`
- Konflikterkennung bei gleichzeitiger Bearbeitung auf mehreren Geräten
- Tägliche automatische Backups mit Rückspiel-Funktion in der Oberfläche
- Heller und dunkler Modus mit lokaler Speicherung der Auswahl
- Material UI Oberfläche mit lokal ausgelieferten Material Symbols
- Lokales App-Icon und Web-App-Manifest für Android- und iOS-Homescreens

## Voraussetzungen

- Docker
- Docker Compose Plugin

Geprüfter Host-Port:

- `13337`

Die App ist danach erreichbar unter:

- `http://<raspberry-pi-ip>:13337`

## Raspberry Pi Hinweise

Die Anwendung ist bewusst einfach gehalten:

- Node.js Server
- React Frontend
- SQLite-Datei in einem Docker-Volume
- SQLite im WAL-Modus für robuste gleichzeitige Nutzung durch mehrere Clients
- Keine zusätzlichen Services

Dadurch eignet sie sich gut für einen Raspberry Pi 4 oder neuer. Für einen stabilen Dauerbetrieb ist ein aktuelles Raspberry Pi OS mit Docker empfehlenswert.

## Start mit Docker Compose

Repository klonen und im Projektordner starten:

```bash
docker compose up -d --build
```

Danach läuft der Container im Hintergrund. Die Datenbank wird automatisch beim ersten Start erzeugt.

Status prüfen:

```bash
docker compose ps
```

Logs ansehen:

```bash
docker compose logs -f
```

## Erster Start

1. Browser öffnen
2. `http://<raspberry-pi-ip>:13337` aufrufen
3. Zuerst einen Raum anlegen
4. Danach einen oder mehrere Aufbewahrungsorte anlegen
5. Anschließend Gegenstände hinzufügen

## Upgrade

Für ein Update im selben Repository:

```bash
git pull
docker compose pull
docker compose up -d --build
```

Hinweis:

- `docker compose pull` lädt nur neue Basis-Images, falls verfügbar.
- Die eigentlichen App-Änderungen aus dem Repository werden durch `docker compose up -d --build` neu gebaut.
- Die Daten bleiben im Docker-Volume erhalten.

## Datenhaltung

Die SQLite-Datenbank liegt im Docker-Volume:

- Volume-Name: `hausbestand-daten`
- Pfad im Container: `/data/inventory.sqlite`
- Backup-Ordner im Container: `/data/backups`

Die Anwendung initialisiert die Datenbank automatisch beim Start und verwendet den SQLite-WAL-Modus. Dadurch werden gleichzeitige Zugriffe mehrerer Browser oder Geräte deutlich robuster verarbeitet. Für Bearbeitungsformulare gibt es zusätzlich eine Konflikterkennung: Wenn ein anderer Client denselben Datensatz inzwischen geändert hat, wird die Änderung nicht still überschrieben.

## Backup

Die Anwendung erstellt automatisch einmal täglich ein Backup:

- Standardzeit: `03:15`
- Standard-Aufbewahrung: `14` Tage
- Speicherort: `/data/backups`

Zusätzlich kann in der Oberfläche unter `Hinweise` jederzeit manuell ein Backup erzeugt oder ein vorhandenes Backup zurückgespielt werden. Vor jedem Restore legt die App automatisch noch ein Sicherheits-Backup des aktuellen Stands an.

### Backup der SQLite-Datei auf den Host kopieren

```bash
docker compose cp hausbestand:/data/inventory.sqlite ./inventory-backup.sqlite
```

### Backup-Dateien der Anwendung auf den Host kopieren

```bash
docker compose cp hausbestand:/data/backups ./backups
```

### Backup des gesamten Docker-Volumes als Tar-Datei

```bash
docker run --rm \
  -v hausbestand-daten:/volume \
  -v "$PWD":/backup \
  busybox \
  tar czf /backup/hausbestand-volume-backup.tar.gz -C /volume .
```

## Restore

### Restore direkt in der App

In der Oberfläche:

1. `Hinweise` öffnen
2. Gewünschtes Backup auswählen
3. `Zurückspielen` bestätigen

Vor dem Restore sichert die App den aktuellen Datenstand automatisch zusätzlich.

### SQLite-Datei wieder einspielen

Container stoppen:

```bash
docker compose down
```

Volume-Inhalt ersetzen:

```bash
docker run --rm \
  -v hausbestand-daten:/volume \
  -v "$PWD":/backup \
  busybox \
  sh -c "rm -f /volume/inventory.sqlite && cp /backup/inventory-backup.sqlite /volume/inventory.sqlite"
```

Container wieder starten:

```bash
docker compose up -d
```

### Restore aus einem Volume-Backup

```bash
docker compose down
docker run --rm \
  -v hausbestand-daten:/volume \
  -v "$PWD":/backup \
  busybox \
  sh -c "rm -rf /volume/* && tar xzf /backup/hausbestand-volume-backup.tar.gz -C /volume"
docker compose up -d
```

## Entwicklung ohne Docker

Abhängigkeiten installieren:

```bash
npm install
```

Produktions-Build erzeugen:

```bash
npm run build
```

Server lokal starten:

```bash
PORT=13337 DATABASE_PATH=./data/inventory.sqlite npm start
```

## API Überblick

Wichtige Endpunkte:

- `GET /api/dashboard`
- `GET /api/alerts`
- `GET /api/search?q=...`
- `GET /api/backups`
- `POST /api/backups`
- `POST /api/backups/restore`
- `GET /api/rooms`
- `POST /api/rooms`
- `PUT /api/rooms/:id`
- `DELETE /api/rooms/:id`
- `GET /api/storage-locations`
- `POST /api/storage-locations`
- `PUT /api/storage-locations/:id`
- `DELETE /api/storage-locations/:id`
- `GET /api/items`
- `POST /api/items`
- `PUT /api/items/:id`
- `DELETE /api/items/:id`
- `POST /api/items/:id/increase`
- `POST /api/items/:id/decrease`
- `POST /api/items/:id/move`
- `POST /api/items/:id/consume`

## Fehlerbehebung

### Die App ist nicht erreichbar

- Prüfen, ob der Container läuft: `docker compose ps`
- Logs prüfen: `docker compose logs -f`
- Prüfen, ob Port `13337` auf dem Host frei ist

### Daten sind nach einem Neustart weg

- Prüfen, ob das Volume `hausbestand-daten` existiert: `docker volume ls`
- Prüfen, ob in `docker-compose.yml` das Volume korrekt eingetragen ist

### Eine Änderung wurde abgelehnt

- Die Meldung weist meist auf eine gleichzeitige Änderung von einem anderen Gerät hin
- Ansicht neu laden und die Änderung mit dem aktuellen Stand erneut ausführen

### Es wurden keine automatischen Backups erstellt

- Logs prüfen: `docker compose logs -f`
- Prüfen, ob der Ordner `/data/backups` im Volume vorhanden ist
- Bei Bedarf können `BACKUP_TIME`, `BACKUP_DIRECTORY` und `BACKUP_RETENTION_DAYS` als Umgebungsvariablen gesetzt werden

### Der Browser zeigt eine alte Version

- Browser-Cache neu laden
- Container neu bauen: `docker compose up -d --build`

### Der Build ist auf dem Raspberry Pi langsam

- Das erste Image-Build kann auf ARM-Geräten einige Minuten dauern
- Spätere Neustarts sind deutlich schneller, da das Volume und Docker-Layer erhalten bleiben
