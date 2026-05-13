import * as React from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Fab,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from "@mui/material";
import type {
  AlertOverview,
  BackupOverview,
  DashboardResponse,
  InventoryItem,
  ItemUnit,
  ItemWithLocation,
  RoomIcon,
  RoomSummary,
  StorageLocationSummary,
  ThemeMode
} from "../../shared/models";
import { ITEM_UNITS, ROOM_ICONS, STORAGE_TYPES } from "../../shared/models";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { SymbolIcon } from "./components/SymbolIcon";
import { formatDate, formatDateTime, formatQuantity } from "./utils/format";

type ViewMode = "uebersicht" | "suche" | "hinweise" | "einstellungen";

interface AppProps {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}

type RoomFormState = {
  id?: number;
  updatedAt?: string;
  name: string;
  icon: string;
  description: string;
};

type StorageFormState = {
  id?: number;
  updatedAt?: string;
  roomId: number;
  name: string;
  type: string;
  isFavorite: boolean;
  description: string;
};

type ItemFormState = {
  id?: number;
  updatedAt?: string;
  storageLocationId: number;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  minimumQuantity: string;
  expirationDate: string;
  notes: string;
};

type MoveItemState = {
  id: number;
  name: string;
  currentStorageLocationId: number;
  targetStorageLocationId: number;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? "Die Anfrage ist fehlgeschlagen.");
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

function getStorageIcon(type: string) {
  switch (type) {
    case "Kühlschrank":
      return "kitchen";
    case "Gefrierschrank":
      return "ac_unit";
    case "Schrank":
      return "door_sliding";
    case "Hängeschrank":
      return "wall_art";
    case "Regal":
      return "shelves";
    case "Box":
      return "inventory_2";
    case "Schublade":
      return "table_rows";
    default:
      return "category";
  }
}

function emptyRoomForm(): RoomFormState {
  return { name: "", icon: "home", description: "" };
}

function emptyStorageForm(roomId?: number): StorageFormState {
  return {
    roomId: roomId ?? 0,
    name: "",
    type: STORAGE_TYPES[0],
    isFavorite: false,
    description: ""
  };
}

function emptyItemForm(storageLocationId?: number): ItemFormState {
  return {
    storageLocationId: storageLocationId ?? 0,
    name: "",
    quantity: "1",
    unit: ITEM_UNITS[0],
    category: "",
    minimumQuantity: "",
    expirationDate: "",
    notes: ""
  };
}

export function App({ mode, onModeChange }: AppProps) {
  const importInputRef = React.useRef<HTMLInputElement | null>(null);
  const itemListRef = React.useRef<HTMLDivElement | null>(null);
  const [dashboard, setDashboard] = React.useState<DashboardResponse | null>(null);
  const [alerts, setAlerts] = React.useState<AlertOverview | null>(null);
  const [backups, setBackups] = React.useState<BackupOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>("uebersicht");
  const [selectedRoomId, setSelectedRoomId] = React.useState<number | null>(null);
  const [selectedStorageId, setSelectedStorageId] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<ItemWithLocation[]>([]);
  const [roomDialogOpen, setRoomDialogOpen] = React.useState(false);
  const [storageDialogOpen, setStorageDialogOpen] = React.useState(false);
  const [itemDialogOpen, setItemDialogOpen] = React.useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = React.useState(false);
  const [roomForm, setRoomForm] = React.useState<RoomFormState>(emptyRoomForm());
  const [storageForm, setStorageForm] = React.useState<StorageFormState>(emptyStorageForm());
  const [itemForm, setItemForm] = React.useState<ItemFormState>(emptyItemForm());
  const [moveItemState, setMoveItemState] = React.useState<MoveItemState | null>(null);
  const [confirmState, setConfirmState] = React.useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const refreshData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboardResponse, alertsResponse, backupsResponse] = await Promise.all([
        request<DashboardResponse>("/api/dashboard"),
        request<AlertOverview>("/api/alerts"),
        request<BackupOverview>("/api/backups")
      ]);
      setDashboard(dashboardResponse);
      setAlerts(alertsResponse);
      setBackups(backupsResponse);
      setSelectedRoomId((current) => current ?? dashboardResponse.rooms[0]?.id ?? null);
      setSelectedStorageId((current) => current ?? dashboardResponse.storageLocations[0]?.id ?? null);
    } catch (refreshError) {
      setError((refreshError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshData();
  }, [refreshData]);

  React.useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      request<ItemWithLocation[]>(`/api/search?q=${encodeURIComponent(trimmed)}`)
        .then(setSearchResults)
        .catch((searchError) => setError((searchError as Error).message));
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  const rooms = dashboard?.rooms ?? [];
  const storageLocations = dashboard?.storageLocations ?? [];
  const items = dashboard?.items ?? [];

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const visibleStorageLocations = selectedRoom
    ? storageLocations.filter((storageLocation) => storageLocation.roomId === selectedRoom.id)
    : [];
  const selectedStorageLocation =
    visibleStorageLocations.find((storageLocation) => storageLocation.id === selectedStorageId) ??
    storageLocations.find((storageLocation) => storageLocation.id === selectedStorageId) ??
    null;
  const visibleItems = selectedStorageLocation
    ? items.filter((item) => item.storageLocationId === selectedStorageLocation.id)
    : [];
  const favoriteStorageLocations = React.useMemo(
    () => storageLocations.filter((storageLocation) => storageLocation.isFavorite === 1),
    [storageLocations]
  );

  React.useEffect(() => {
    if (!selectedRoom && rooms[0]) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoom]);

  React.useEffect(() => {
    if (selectedRoom && visibleStorageLocations.length > 0) {
      const stillVisible = visibleStorageLocations.some(
        (storageLocation) => storageLocation.id === selectedStorageId
      );
      if (!stillVisible) {
        setSelectedStorageId(visibleStorageLocations[0].id);
      }
    }
  }, [selectedRoom, selectedStorageId, visibleStorageLocations]);

  const openRoomDialog = (room?: RoomSummary) => {
    setRoomForm(
      room
        ? {
            id: room.id,
            updatedAt: room.updatedAt,
            name: room.name,
            icon: room.icon ?? "home",
            description: room.description ?? ""
          }
        : emptyRoomForm()
    );
    setRoomDialogOpen(true);
  };

  const openStorageDialog = (storageLocation?: StorageLocationSummary, roomId?: number) => {
    setStorageForm(
      storageLocation
        ? {
            id: storageLocation.id,
            updatedAt: storageLocation.updatedAt,
            roomId: storageLocation.roomId,
            name: storageLocation.name,
            type: storageLocation.type,
            isFavorite: storageLocation.isFavorite === 1,
            description: storageLocation.description ?? ""
          }
        : emptyStorageForm(roomId ?? selectedRoomId ?? rooms[0]?.id)
    );
    setStorageDialogOpen(true);
  };

  const navigateToStorageLocation = (storageLocationId: number) => {
    const storageLocation = storageLocations.find((candidate) => candidate.id === storageLocationId);
    if (!storageLocation) {
      return;
    }
    setSelectedRoomId(storageLocation.roomId);
    setSelectedStorageId(storageLocation.id);
    setViewMode("uebersicht");
    window.setTimeout(() => {
      itemListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const openItemDialog = (item?: ItemWithLocation, storageLocationId?: number) => {
    setItemForm(
      item
        ? {
            id: item.id,
            updatedAt: item.updatedAt,
            storageLocationId: item.storageLocationId,
            name: item.name,
            quantity: String(item.quantity),
            unit: item.unit,
            category: item.category ?? "",
            minimumQuantity: item.minimumQuantity == null ? "" : String(item.minimumQuantity),
            expirationDate: item.expirationDate ?? "",
            notes: item.notes ?? ""
          }
        : emptyItemForm(storageLocationId ?? selectedStorageId ?? storageLocations[0]?.id)
    );
    setItemDialogOpen(true);
  };

  const submitRoom = async () => {
    setSubmitting(true);
    try {
      if (roomForm.id) {
        await request(`/api/rooms/${roomForm.id}`, {
          method: "PUT",
          body: JSON.stringify({
            ...roomForm,
            expectedUpdatedAt: roomForm.updatedAt
          })
        });
      } else {
        await request("/api/rooms", {
          method: "POST",
          body: JSON.stringify(roomForm)
        });
      }
      setRoomDialogOpen(false);
      await refreshData();
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitStorage = async () => {
    setSubmitting(true);
    try {
      if (storageForm.id) {
        await request(`/api/storage-locations/${storageForm.id}`, {
          method: "PUT",
          body: JSON.stringify({
            ...storageForm,
            expectedUpdatedAt: storageForm.updatedAt
          })
        });
      } else {
        await request("/api/storage-locations", {
          method: "POST",
          body: JSON.stringify(storageForm)
        });
      }
      setStorageDialogOpen(false);
      await refreshData();
      setSelectedRoomId(storageForm.roomId);
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitItem = async () => {
    setSubmitting(true);
    try {
      const payload = {
        ...itemForm,
        quantity: Number(itemForm.quantity),
        expectedUpdatedAt: itemForm.updatedAt,
        minimumQuantity:
          itemForm.minimumQuantity.trim().length > 0 ? Number(itemForm.minimumQuantity) : null
      };
      if (itemForm.id) {
        await request(`/api/items/${itemForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await request("/api/items", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      setItemDialogOpen(false);
      await refreshData();
      setSelectedStorageId(itemForm.storageLocationId);
      const storageLocation = storageLocations.find(
        (candidate) => candidate.id === itemForm.storageLocationId
      );
      if (storageLocation) {
        setSelectedRoomId(storageLocation.roomId);
      }
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const mutateItem = async (itemId: number, action: string, body?: Record<string, unknown>) => {
    try {
      await request(`/api/items/${itemId}/${action}`, {
        method: "POST",
        body: JSON.stringify(body ?? {})
      });
      await refreshData();
    } catch (mutationError) {
      setError((mutationError as Error).message);
    }
  };

  const openMoveDialog = (item: ItemWithLocation) => {
    setMoveItemState({
      id: item.id,
      name: item.name,
      currentStorageLocationId: item.storageLocationId,
      targetStorageLocationId: item.storageLocationId
    });
    setMoveDialogOpen(true);
  };

  const submitMoveItem = async () => {
    if (!moveItemState) {
      return;
    }

    try {
      await request(`/api/items/${moveItemState.id}/move`, {
        method: "POST",
        body: JSON.stringify({ storageLocationId: moveItemState.targetStorageLocationId })
      });
      setMoveDialogOpen(false);
      setSelectedStorageId(moveItemState.targetStorageLocationId);
      const targetStorage = storageLocations.find(
        (storageLocation) => storageLocation.id === moveItemState.targetStorageLocationId
      );
      if (targetStorage) {
        setSelectedRoomId(targetStorage.roomId);
      }
      setMoveItemState(null);
      await refreshData();
    } catch (moveError) {
      setError((moveError as Error).message);
    }
  };

  const deleteEntity = (
    type: "room" | "storage" | "item",
    entity: { id: number; updatedAt: string }
  ) => {
    const config = {
      room: {
        url: `/api/rooms/${entity.id}`,
        title: "Raum löschen",
        message: "Möchtest du diesen Raum wirklich löschen?",
        label: "Raum löschen"
      },
      storage: {
        url: `/api/storage-locations/${entity.id}`,
        title: "Aufbewahrungsort löschen",
        message: "Möchtest du diesen Aufbewahrungsort wirklich löschen?",
        label: "Aufbewahrungsort löschen"
      },
      item: {
        url: `/api/items/${entity.id}`,
        title: "Gegenstand löschen",
        message: "Möchtest du diesen Gegenstand wirklich löschen?",
        label: "Gegenstand löschen"
      }
    }[type];

    setConfirmState({
      title: config.title,
      message: config.message,
      confirmLabel: config.label,
      onConfirm: () => {
        request(config.url, {
          method: "DELETE",
          body: JSON.stringify({ expectedUpdatedAt: entity.updatedAt })
        })
          .then(refreshData)
          .catch((deleteError) => setError((deleteError as Error).message))
          .finally(() => setConfirmState(null));
      }
    });
  };

  const createManualBackup = async () => {
    try {
      await request("/api/backups", { method: "POST", body: JSON.stringify({}) });
      await refreshData();
    } catch (backupError) {
      setError((backupError as Error).message);
    }
  };

  const restoreBackup = (fileName: string) => {
    setConfirmState({
      title: "Backup zurückspielen",
      message:
        "Möchtest du dieses Backup wirklich zurückspielen? Der aktuelle Datenstand wird vorher automatisch gesichert.",
      confirmLabel: "Backup zurückspielen",
      onConfirm: () => {
        request("/api/backups/restore", {
          method: "POST",
          body: JSON.stringify({ fileName })
        })
          .then(refreshData)
          .catch((restoreError) => setError((restoreError as Error).message))
          .finally(() => setConfirmState(null));
      }
    });
  };

  const downloadJsonExport = async () => {
    try {
      const response = await fetch("/api/export");
      if (!response.ok) {
        throw new Error("Export konnte nicht erstellt werden.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hausbestand-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError((exportError as Error).message);
    }
  };

  const importJsonFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown;
      await request("/api/import", {
        method: "POST",
        body: JSON.stringify(data)
      });
      await refreshData();
      setViewMode("einstellungen");
    } catch (importError) {
      setError((importError as Error).message);
    } finally {
      event.target.value = "";
    }
  };

  const quickStats = [
    {
      label: "Räume",
      value: rooms.length,
      icon: "meeting_room"
    },
    {
      label: "Aufbewahrungsorte",
      value: storageLocations.length,
      icon: "inventory"
    },
    {
      label: "Gegenstände",
      value: items.length,
      icon: "package_2"
    }
  ];

  return (
    <Box sx={{ pb: 10 }}>
      <AppBar position="sticky" color="transparent" elevation={0}>
        <Box
          sx={{
            backdropFilter: "blur(18px)",
            bgcolor: "rgba(15, 20, 22, 0.12)",
            borderBottom: "1px solid",
            borderColor: "divider"
          }}
        >
          <Toolbar>
            <Stack direction="row" spacing={1.5} alignItems="center" flexGrow={1} minWidth={0}>
              <Box
                sx={{
                  display: "grid",
                  placeItems: "center",
                  width: 44,
                  height: 44,
                  borderRadius: 3,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  flexShrink: 0
                }}
              >
                <SymbolIcon icon="home_storage" />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6">Hausbestand</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  Räume, Vorräte und Bestände lokal verwalten
                </Typography>
              </Box>
            </Stack>
            <Tooltip title={mode === "dark" ? "Hellen Modus aktivieren" : "Dunklen Modus aktivieren"}>
              <IconButton
                color="inherit"
                aria-label={mode === "dark" ? "Hellen Modus aktivieren" : "Dunklen Modus aktivieren"}
                onClick={() => onModeChange(mode === "dark" ? "light" : "dark")}
              >
                <SymbolIcon icon={mode === "dark" ? "light_mode" : "dark_mode"} />
              </IconButton>
            </Tooltip>
          </Toolbar>

          <Box
            sx={{
              px: { xs: 1.5, sm: 2.5 },
              pb: 1,
              overflowX: "auto",
              scrollbarWidth: "thin"
            }}
          >
            <Stack direction="row" spacing={1} minWidth="max-content" alignItems="center">
              <Chip
                label={
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box
                      sx={{
                        display: "grid",
                        placeItems: "center",
                        width: 18,
                        height: 18,
                        "& span": { fontSize: "1rem" }
                      }}
                    >
                      <SymbolIcon icon="grid_view" />
                    </Box>
                    <span>Übersicht</span>
                  </Stack>
                }
                clickable
                color={viewMode === "uebersicht" ? "primary" : "default"}
                variant={viewMode === "uebersicht" ? "filled" : "outlined"}
                onClick={() => setViewMode("uebersicht")}
              />
              {rooms.map((room) => (
                <Chip
                  key={room.id}
                  label={room.name}
                  clickable
                  color={selectedRoomId === room.id ? "primary" : "default"}
                  variant={selectedRoomId === room.id ? "filled" : "outlined"}
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setViewMode("uebersicht");
                  }}
                />
              ))}
              <Chip
                label={
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box
                      sx={{
                        display: "grid",
                        placeItems: "center",
                        width: 18,
                        height: 18,
                        "& span": { fontSize: "1rem" }
                      }}
                    >
                      <SymbolIcon icon="settings" />
                    </Box>
                    <span>Einstellungen</span>
                  </Stack>
                }
                clickable
                color={viewMode === "einstellungen" ? "primary" : "default"}
                variant={viewMode === "einstellungen" ? "filled" : "outlined"}
                onClick={() => setViewMode("einstellungen")}
              />
            </Stack>
          </Box>
        </Box>
      </AppBar>

      <Container maxWidth="xl" sx={{ pt: 3 }}>
        <Stack spacing={3}>
          <Card
            sx={{
              overflow: "hidden",
              border: "1px solid",
              borderColor: "divider"
            }}
          >
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 12, md: 5 }}>
                  <Stack spacing={1}>
                    <Typography variant="h4">Schneller Überblick</Typography>
                    <Typography color="text.secondary">
                      Füge Räume, Aufbewahrungsorte und Gegenstände direkt hinzu und passe Mengen mit
                      wenigen Fingertipps an.
                    </Typography>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth
                    label="Suche nach Gegenständen"
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setViewMode(event.target.value.trim() ? "suche" : "uebersicht");
                    }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SymbolIcon icon="search" />
                        </InputAdornment>
                      )
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <Stack direction="row" spacing={1} justifyContent={{ xs: "flex-start", md: "flex-end" }}>
                    <Button
                      variant="contained"
                      startIcon={<SymbolIcon icon="add_home" />}
                      onClick={() => openRoomDialog()}
                    >
                      Raum hinzufügen
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<SymbolIcon icon="add_box" />}
                      onClick={() => openItemDialog(undefined, selectedStorageId ?? undefined)}
                    >
                      Gegenstand
                    </Button>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Tabs
            value={viewMode}
            onChange={(_event, value) => setViewMode(value)}
            variant="scrollable"
            sx={{
              minHeight: 56,
              "& .MuiTabs-indicator": {
                display: "none"
              },
              "& .MuiTabs-flexContainer": {
                gap: 1,
                flexWrap: "wrap"
              }
            }}
          >
            <Tab
              value="uebersicht"
              icon={<SymbolIcon icon="grid_view" />}
              iconPosition="start"
              label="Übersicht"
              sx={{
                minHeight: 44,
                borderRadius: 999,
                border: "1px solid",
                borderColor: "divider",
                textTransform: "none",
                bgcolor: viewMode === "uebersicht" ? "primary.main" : "background.paper",
                color: viewMode === "uebersicht" ? "primary.contrastText !important" : "text.primary"
              }}
            />
            <Tab
              value="suche"
              icon={<SymbolIcon icon="search" />}
              iconPosition="start"
              label="Suche"
              sx={{
                minHeight: 44,
                borderRadius: 999,
                border: "1px solid",
                borderColor: "divider",
                textTransform: "none",
                bgcolor: viewMode === "suche" ? "primary.main" : "background.paper",
                color: viewMode === "suche" ? "primary.contrastText !important" : "text.primary"
              }}
            />
            <Tab
              value="hinweise"
              icon={<SymbolIcon icon="notifications" />}
              iconPosition="start"
              label="Hinweise"
              sx={{
                minHeight: 44,
                borderRadius: 999,
                border: "1px solid",
                borderColor: "divider",
                textTransform: "none",
                bgcolor: viewMode === "hinweise" ? "primary.main" : "background.paper",
                color: viewMode === "hinweise" ? "primary.contrastText !important" : "text.primary"
              }}
            />
            <Tab
              value="einstellungen"
              icon={<SymbolIcon icon="settings" />}
              iconPosition="start"
              label="Einstellungen"
              sx={{
                minHeight: 44,
                borderRadius: 999,
                border: "1px solid",
                borderColor: "divider",
                textTransform: "none",
                bgcolor: viewMode === "einstellungen" ? "primary.main" : "background.paper",
                color:
                  viewMode === "einstellungen" ? "primary.contrastText !important" : "text.primary"
              }}
            />
          </Tabs>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {loading ? (
            <Stack alignItems="center" py={8}>
              <CircularProgress />
            </Stack>
          ) : null}

          {!loading && dashboard ? (
            <>
              <Card sx={{ border: "1px solid", borderColor: "divider" }}>
                <CardContent>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1.5}
                    alignItems={{ md: "center" }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Typography variant="h5">Aktuelle Navigation</Typography>
                      <Typography color="text.secondary">
                        So siehst du sofort, in welchem Teil deines Bestands du gerade arbeitest.
                      </Typography>
                    </Box>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Chip
                        color="primary"
                        variant="filled"
                        label={`Raum: ${selectedRoom?.name ?? "Nicht gewählt"}`}
                        icon={
                          <Box
                            sx={{
                              display: "grid",
                              placeItems: "center",
                              width: 18,
                              height: 18,
                              "& span": { fontSize: "1rem" }
                            }}
                          >
                            <SymbolIcon icon={selectedRoom?.icon ?? "home"} />
                          </Box>
                        }
                        sx={{
                          "& .MuiChip-icon": {
                            ml: 1,
                            mr: -0.25
                          }
                        }}
                      />
                      <Chip
                        color="secondary"
                        variant="filled"
                        label={`Ort: ${selectedStorageLocation?.name ?? "Nicht gewählt"}`}
                        icon={
                          <Box
                            sx={{
                              display: "grid",
                              placeItems: "center",
                              width: 18,
                              height: 18,
                              "& span": { fontSize: "1rem" }
                            }}
                          >
                            <SymbolIcon
                              icon={
                                selectedStorageLocation
                                  ? getStorageIcon(selectedStorageLocation.type)
                                  : "inventory"
                              }
                            />
                          </Box>
                        }
                        sx={{
                          "& .MuiChip-icon": {
                            ml: 1,
                            mr: -0.25
                          }
                        }}
                      />
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              {favoriteStorageLocations.length > 0 ? (
                <Card sx={{ border: "1px solid", borderColor: "divider" }}>
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Box>
                        <Typography variant="h5">Schnellzugriff</Typography>
                        <Typography color="text.secondary">
                          Favorisierte Aufbewahrungsorte direkt anspringen.
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {favoriteStorageLocations.map((storageLocation) => {
                          const room = rooms.find((candidate) => candidate.id === storageLocation.roomId);
                          return (
                            <Button
                              key={storageLocation.id}
                              variant={
                                selectedStorageId === storageLocation.id ? "contained" : "outlined"
                              }
                              startIcon={<SymbolIcon icon={getStorageIcon(storageLocation.type)} />}
                              onClick={() => navigateToStorageLocation(storageLocation.id)}
                            >
                              {room?.name ? `${room.name}: ` : ""}
                              {storageLocation.name}
                            </Button>
                          );
                        })}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ) : null}

              {viewMode === "suche" ? (
                <Card sx={{ border: "1px solid", borderColor: "divider" }}>
                  <CardContent>
                    <Typography variant="h5" gutterBottom>
                      Suchergebnisse
                    </Typography>
                    {searchQuery.trim() ? (
                      <List disablePadding>
                        {searchResults.map((item) => (
                          <ListItem
                            key={item.id}
                            sx={{ px: 0 }}
                            secondaryAction={
                              <Button
                                onClick={() => {
                                  setSelectedRoomId(item.roomId);
                                  setSelectedStorageId(item.storageLocationId);
                                  setViewMode("uebersicht");
                                }}
                              >
                                Öffnen
                              </Button>
                            }
                          >
                            <ListItemText
                              primary={`${item.name} · ${formatQuantity(item.quantity)} ${item.unit}`}
                              secondary={`${item.roomName} / ${item.storageLocationName}${
                                item.expirationDate ? ` · Ablauf: ${formatDate(item.expirationDate)}` : ""
                              }`}
                            />
                          </ListItem>
                        ))}
                        {searchResults.length === 0 ? (
                          <Typography color="text.secondary">
                            Keine Treffer für diese Suche.
                          </Typography>
                        ) : null}
                      </List>
                    ) : (
                      <Typography color="text.secondary">
                        Gib oben einen Suchbegriff ein, um Gegenstände zu finden.
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              {viewMode === "hinweise" && alerts ? (
                <Stack spacing={2}>
                  <Grid container spacing={2}>
                    {quickStats.map((stat) => (
                      <Grid key={stat.label} size={{ xs: 12, sm: 4 }}>
                        <Card sx={{ border: "1px solid", borderColor: "divider" }}>
                          <CardContent>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Box>
                                <Typography color="text.secondary">{stat.label}</Typography>
                                <Typography variant="h4">{stat.value}</Typography>
                              </Box>
                              <Box
                                sx={{
                                  display: "grid",
                                  placeItems: "center",
                                  width: 46,
                                  height: 46,
                                  borderRadius: 3,
                                  bgcolor: "secondary.main",
                                  color: "secondary.contrastText"
                                }}
                              >
                                <SymbolIcon icon={stat.icon} />
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                  <Grid container spacing={2}>
                    {[
                      { title: "Niedriger Bestand", data: alerts.lowStock, icon: "warning" },
                      { title: "MHD in 3 Tagen", data: alerts.bddSoon, icon: "schedule" },
                      { title: "Bald ablaufend", data: alerts.expiringSoon, icon: "event_busy" },
                      { title: "Aufgebraucht", data: alerts.depleted, icon: "remove_shopping_cart" }
                    ].map((section) => (
                      <Grid key={section.title} size={{ xs: 12, md: 6, xl: 3 }}>
                        <Card sx={{ height: "100%", border: "1px solid", borderColor: "divider" }}>
                          <CardContent>
                            <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
                              <SymbolIcon icon={section.icon} />
                              <Typography variant="h6">{section.title}</Typography>
                            </Stack>
                            <Stack spacing={1.5}>
                              {section.data.slice(0, 8).map((item) => (
                                <Box key={item.id}>
                                  <Typography fontWeight={600}>
                                    {item.name} · {formatQuantity(item.quantity)} {item.unit}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {item.roomName} / {item.storageLocationName}
                                    {item.expirationDate ? ` · ${formatDate(item.expirationDate)}` : ""}
                                  </Typography>
                                </Box>
                              ))}
                              {section.data.length === 0 ? (
                                <Typography color="text.secondary">Aktuell keine Einträge.</Typography>
                              ) : null}
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>

                  <Card sx={{ border: "1px solid", borderColor: "divider" }}>
                    <CardContent>
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        justifyContent="space-between"
                        spacing={2}
                        mb={2}
                      >
                        <Box>
                          <Typography variant="h5">Backups</Typography>
                          <Typography color="text.secondary">
                            Tägliche automatische Sicherung um {backups?.automaticBackupTime ?? "03:15"} Uhr.
                            {backups?.nextAutomaticBackupAt
                              ? ` Nächstes Backup: ${formatDateTime(backups.nextAutomaticBackupAt)}`
                              : ""}
                          </Typography>
                        </Box>
                        <Button
                          variant="contained"
                          startIcon={<SymbolIcon icon="save" />}
                          onClick={() => void createManualBackup()}
                        >
                          Backup jetzt erstellen
                        </Button>
                      </Stack>
                      <Stack spacing={1.5}>
                        {backups?.backups.map((backup) => (
                          <Card key={backup.fileName} variant="outlined">
                            <CardContent sx={{ pb: "16px !important" }}>
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                justifyContent="space-between"
                                spacing={1.5}
                                alignItems={{ sm: "center" }}
                              >
                                <Box>
                                  <Typography fontWeight={700}>{backup.fileName}</Typography>
                                  <Typography color="text.secondary">
                                    Erstellt: {formatDateTime(backup.createdAt)} · Größe:{" "}
                                    {Math.round(backup.sizeBytes / 1024)} KB
                                  </Typography>
                                </Box>
                                <Button onClick={() => restoreBackup(backup.fileName)}>
                                  Zurückspielen
                                </Button>
                              </Stack>
                            </CardContent>
                          </Card>
                        ))}
                        {backups && backups.backups.length === 0 ? (
                          <Typography color="text.secondary">
                            Es wurden noch keine Backups gespeichert.
                          </Typography>
                        ) : null}
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card sx={{ border: "1px solid", borderColor: "divider" }}>
                    <CardContent>
                      <Typography variant="h5" mb={2}>
                        Tägliche JSON-Exporte
                      </Typography>
                      <Stack spacing={1.5}>
                        {backups?.exports.map((exportFile) => (
                          <Card key={exportFile.fileName} variant="outlined">
                            <CardContent sx={{ pb: "16px !important" }}>
                              <Typography fontWeight={700}>{exportFile.fileName}</Typography>
                              <Typography color="text.secondary">
                                Erstellt: {formatDateTime(exportFile.createdAt)} · Größe:{" "}
                                {Math.round(exportFile.sizeBytes / 1024)} KB
                              </Typography>
                            </CardContent>
                          </Card>
                        ))}
                        {backups && backups.exports.length === 0 ? (
                          <Typography color="text.secondary">
                            Es wurden noch keine JSON-Exporte gespeichert.
                          </Typography>
                        ) : null}
                      </Stack>
                    </CardContent>
                  </Card>
                </Stack>
              ) : null}

              {viewMode === "einstellungen" ? (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, lg: 6 }}>
                    <Card sx={{ border: "1px solid", borderColor: "divider", height: "100%" }}>
                      <CardContent>
                        <Stack spacing={2}>
                          <Box>
                            <Typography variant="h5">Daten exportieren</Typography>
                            <Typography color="text.secondary">
                              Lade den aktuellen Datenstand als JSON-Datei herunter.
                            </Typography>
                          </Box>
                          <Button
                            variant="contained"
                            startIcon={<SymbolIcon icon="download" />}
                            onClick={() => void downloadJsonExport()}
                          >
                            JSON exportieren
                          </Button>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12, lg: 6 }}>
                    <Card sx={{ border: "1px solid", borderColor: "divider", height: "100%" }}>
                      <CardContent>
                        <Stack spacing={2}>
                          <Box>
                            <Typography variant="h5">Daten importieren</Typography>
                            <Typography color="text.secondary">
                              Spiele eine zuvor exportierte JSON-Datei ein. Vor dem Import wird
                              automatisch ein Sicherheits-Backup erstellt.
                            </Typography>
                          </Box>
                          <input
                            ref={importInputRef}
                            type="file"
                            accept="application/json,.json"
                            hidden
                            onChange={(event) => void importJsonFile(event)}
                          />
                          <Button
                            variant="outlined"
                            startIcon={<SymbolIcon icon="upload" />}
                            onClick={() => importInputRef.current?.click()}
                          >
                            JSON-Datei auswählen
                          </Button>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              ) : null}

              {viewMode === "uebersicht" ? (
                <Stack spacing={2}>
                  <Card sx={{ border: "1px solid", borderColor: "divider" }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h5">Räume</Typography>
                        <Button
                          size="small"
                          startIcon={<SymbolIcon icon="add" />}
                          onClick={() => openRoomDialog()}
                        >
                          Hinzufügen
                        </Button>
                      </Stack>
                      <Box sx={{ overflowX: "auto", pb: 0.5 }}>
                        <Stack direction="row" spacing={1.5} minWidth="max-content">
                          {rooms.map((room) => (
                            <Card
                              key={room.id}
                              variant={selectedRoomId === room.id ? "elevation" : "outlined"}
                              sx={{
                                minWidth: { xs: 200, md: 220 },
                                maxWidth: { xs: 200, md: 240 },
                                cursor: "pointer",
                                borderWidth: selectedRoomId === room.id ? 2 : 1,
                                borderColor: selectedRoomId === room.id ? "primary.main" : "divider",
                                bgcolor:
                                  selectedRoomId === room.id ? "rgba(20, 108, 99, 0.10)" : "background.paper",
                                boxShadow:
                                  selectedRoomId === room.id
                                    ? "0 14px 28px rgba(20, 108, 99, 0.16)"
                                    : undefined
                              }}
                              onClick={() => setSelectedRoomId(room.id)}
                            >
                              <CardContent sx={{ pb: "16px !important" }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="start">
                                  <Box>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                      <Box
                                        sx={{
                                          display: "grid",
                                          placeItems: "center",
                                          width: 32,
                                          height: 32,
                                          borderRadius: 2,
                                          bgcolor: "action.hover"
                                        }}
                                      >
                                        <SymbolIcon icon={room.icon ?? "home"} />
                                      </Box>
                                      <Typography variant="h6">{room.name}</Typography>
                                    </Stack>
                                    <Typography mt={0.5} color="text.secondary">
                                      {room.storageCount} Aufbewahrungsorte · {room.itemCount} Gegenstände
                                    </Typography>
                                  </Box>
                                  <Stack direction="row" spacing={0.5}>
                                    <IconButton
                                      aria-label={`Raum ${room.name} bearbeiten`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openRoomDialog(room);
                                      }}
                                    >
                                      <SymbolIcon icon="edit" />
                                    </IconButton>
                                    <IconButton
                                      aria-label={`Aufbewahrungsort in ${room.name} hinzufügen`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openStorageDialog(undefined, room.id);
                                      }}
                                    >
                                      <SymbolIcon icon="add_box" />
                                    </IconButton>
                                  </Stack>
                                </Stack>
                              </CardContent>
                            </Card>
                          ))}
                        </Stack>
                      </Box>
                    </CardContent>
                  </Card>

                  <Card sx={{ border: "1px solid", borderColor: "divider" }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <Box>
                          <Typography variant="h5">
                            {selectedRoom ? `Aufbewahrungsorte in ${selectedRoom.name}` : "Aufbewahrungsorte"}
                          </Typography>
                          <Typography color="text.secondary">
                            Tippe auf einen Ort, um den Bestand darunter zu sehen.
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          startIcon={<SymbolIcon icon="add" />}
                          onClick={() => openStorageDialog(undefined, selectedRoomId ?? undefined)}
                        >
                          Hinzufügen
                        </Button>
                      </Stack>
                      {selectedRoom && visibleStorageLocations.length > 0 ? (
                        <Box sx={{ overflowX: "auto", pb: 0.5 }}>
                          <Stack direction="row" spacing={1.5} minWidth="max-content">
                            {visibleStorageLocations.map((storageLocation) => (
                              <Card
                                key={storageLocation.id}
                                variant={selectedStorageId === storageLocation.id ? "elevation" : "outlined"}
                              sx={{
                                  minWidth: { xs: 220, md: 250 },
                                  maxWidth: { xs: 220, md: 280 },
                                  cursor: "pointer",
                                  borderWidth: selectedStorageId === storageLocation.id ? 2 : 1,
                                  borderColor:
                                    selectedStorageId === storageLocation.id ? "secondary.main" : "divider",
                                  bgcolor:
                                    selectedStorageId === storageLocation.id
                                      ? "rgba(184, 92, 0, 0.10)"
                                      : "background.paper",
                                  boxShadow:
                                    selectedStorageId === storageLocation.id
                                      ? "0 14px 28px rgba(184, 92, 0, 0.14)"
                                      : undefined
                                }}
                                onClick={() => setSelectedStorageId(storageLocation.id)}
                              >
                                <CardContent sx={{ pb: "16px !important" }}>
                                  <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                                    <Stack direction="row" spacing={1.5} alignItems="center">
                                      <Box
                                        sx={{
                                          display: "grid",
                                          placeItems: "center",
                                          width: 42,
                                          height: 42,
                                          borderRadius: 3,
                                          bgcolor: "action.hover"
                                        }}
                                      >
                                        <SymbolIcon icon={getStorageIcon(storageLocation.type)} />
                                      </Box>
                                      <Box>
                                        <Stack direction="row" spacing={0.75} alignItems="center">
                                          <Typography fontWeight={700}>{storageLocation.name}</Typography>
                                          {storageLocation.isFavorite === 1 ? (
                                            <SymbolIcon icon="star" />
                                          ) : null}
                                        </Stack>
                                        <Typography color="text.secondary">
                                          {storageLocation.type} · {storageLocation.itemCount} Gegenstände
                                        </Typography>
                                      </Box>
                                    </Stack>
                                    <Stack direction="row" spacing={0.5}>
                                      <IconButton
                                        aria-label={`${storageLocation.name} bearbeiten`}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openStorageDialog(storageLocation);
                                        }}
                                      >
                                        <SymbolIcon icon="edit" />
                                      </IconButton>
                                      <IconButton
                                        aria-label={`Gegenstand in ${storageLocation.name} hinzufügen`}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openItemDialog(undefined, storageLocation.id);
                                        }}
                                      >
                                        <SymbolIcon icon="playlist_add" />
                                      </IconButton>
                                    </Stack>
                                  </Stack>
                                </CardContent>
                              </Card>
                            ))}
                          </Stack>
                        </Box>
                      ) : (
                        <Typography color="text.secondary">
                          {!selectedRoom
                            ? "Wähle zuerst einen Raum aus."
                            : "Für diesen Raum gibt es noch keine Aufbewahrungsorte."}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>

                  <Card sx={{ border: "1px solid", borderColor: "divider" }} ref={itemListRef}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <Box>
                          <Typography variant="h5">
                            {selectedStorageLocation
                              ? `Bestand in ${selectedStorageLocation.name}`
                              : "Bestand"}
                          </Typography>
                          <Typography color="text.secondary">
                            Mengen können direkt mit `+` und `-` angepasst werden.
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          startIcon={<SymbolIcon icon="add" />}
                          onClick={() => openItemDialog(undefined, selectedStorageId ?? undefined)}
                        >
                          Hinzufügen
                        </Button>
                      </Stack>
                      <Stack spacing={1.5}>
                        {visibleItems.map((item) => (
                          <Card key={item.id} variant="outlined">
                            <CardContent sx={{ pb: "16px !important" }}>
                              <Stack
                                direction={{ xs: "column", lg: "row" }}
                                spacing={2}
                                justifyContent="space-between"
                                alignItems={{ lg: "center" }}
                              >
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography variant="h6">{item.name}</Typography>
                                  <Typography color="text.secondary">
                                    {formatQuantity(item.quantity)} {item.unit}
                                    {item.category ? ` · ${item.category}` : ""}
                                  </Typography>
                                  <Stack direction="row" spacing={1} flexWrap="wrap" mt={1}>
                                    {item.minimumQuantity != null ? (
                                      <Chip
                                        size="small"
                                        color={item.quantity <= item.minimumQuantity ? "warning" : "default"}
                                        label={`Mindestmenge: ${formatQuantity(item.minimumQuantity)} ${item.unit}`}
                                      />
                                    ) : null}
                                    {item.expirationDate ? (
                                      <Chip size="small" label={`MHD/BBD: ${formatDate(item.expirationDate)}`} />
                                    ) : null}
                                  </Stack>
                                  {item.notes ? (
                                    <Typography mt={1} variant="body2" color="text.secondary">
                                      {item.notes}
                                    </Typography>
                                  ) : null}
                                </Box>

                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1}
                                  alignItems={{ xs: "stretch", sm: "center" }}
                                  flexWrap="wrap"
                                  justifyContent={{ sm: "flex-end" }}
                                >
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => mutateItem(item.id, "decrease", { amount: 1 })}
                                  >
                                    -
                                  </Button>
                                  <Button
                                    variant="contained"
                                    size="small"
                                    onClick={() => mutateItem(item.id, "increase", { amount: 1 })}
                                  >
                                    +
                                  </Button>
                                  <Button size="small" onClick={() => mutateItem(item.id, "consume")}>
                                    Entnehmen
                                  </Button>
                                  <IconButton
                                    aria-label={`${item.name} bearbeiten`}
                                    onClick={() => openItemDialog(item)}
                                  >
                                    <SymbolIcon icon="edit" />
                                  </IconButton>
                                  <IconButton
                                    aria-label={`${item.name} verschieben`}
                                    onClick={() => openMoveDialog(item)}
                                  >
                                    <SymbolIcon icon="forward" />
                                  </IconButton>
                                  <IconButton
                                    aria-label={`${item.name} löschen`}
                                    onClick={() => deleteEntity("item", item)}
                                  >
                                    <SymbolIcon icon="delete" />
                                  </IconButton>
                                </Stack>
                              </Stack>
                            </CardContent>
                          </Card>
                        ))}
                        {!selectedStorageLocation || visibleItems.length === 0 ? (
                          <Typography color="text.secondary">
                            {!selectedStorageLocation
                              ? "Wähle zuerst einen Aufbewahrungsort aus."
                              : "Für diesen Aufbewahrungsort gibt es noch keine Gegenstände."}
                          </Typography>
                        ) : null}
                      </Stack>
                    </CardContent>
                  </Card>
                </Stack>
              ) : null}
            </>
          ) : null}
        </Stack>
      </Container>

      <Fab
        color="primary"
        aria-label="Gegenstand hinzufügen"
        onClick={() => openItemDialog(undefined, selectedStorageId ?? undefined)}
        sx={{ position: "fixed", right: 20, bottom: 20 }}
      >
        <SymbolIcon icon="add" />
      </Fab>

      <Dialog open={roomDialogOpen} onClose={() => setRoomDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{roomForm.id ? "Raum bearbeiten" : "Raum hinzufügen"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <TextField
              autoFocus
              label="Name"
              value={roomForm.name}
              onChange={(event) => setRoomForm((current) => ({ ...current, name: event.target.value }))}
            />
            <TextField
              select
              label="Raum-Icon"
              value={roomForm.icon}
              onChange={(event) =>
                setRoomForm((current) => ({ ...current, icon: event.target.value as RoomIcon }))
              }
            >
              {ROOM_ICONS.map((icon) => (
                <MenuItem key={icon} value={icon}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <SymbolIcon icon={icon} />
                    <span>{icon}</span>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Beschreibung"
              multiline
              minRows={2}
              value={roomForm.description}
              onChange={(event) =>
                setRoomForm((current) => ({ ...current, description: event.target.value }))
              }
            />
            {roomForm.id ? (
              <Button
                color="error"
                onClick={() =>
                  roomForm.id && roomForm.updatedAt
                    ? deleteEntity("room", { id: roomForm.id, updatedAt: roomForm.updatedAt })
                    : undefined
                }
              >
                Raum löschen
              </Button>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoomDialogOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={submitRoom} disabled={submitting}>
            Speichern
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={storageDialogOpen} onClose={() => setStorageDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          {storageForm.id ? "Aufbewahrungsort bearbeiten" : "Aufbewahrungsort hinzufügen"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <TextField
              select
              label="Raum"
              value={storageForm.roomId}
              onChange={(event) =>
                setStorageForm((current) => ({ ...current, roomId: Number(event.target.value) }))
              }
            >
              {rooms.map((room) => (
                <MenuItem key={room.id} value={room.id}>
                  {room.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Name"
              value={storageForm.name}
              onChange={(event) =>
                setStorageForm((current) => ({ ...current, name: event.target.value }))
              }
            />
            <TextField
              select
              label="Typ"
              value={storageForm.type}
              onChange={(event) =>
                setStorageForm((current) => ({ ...current, type: event.target.value }))
              }
            >
              {STORAGE_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Beschreibung"
              multiline
              minRows={2}
              value={storageForm.description}
              onChange={(event) =>
                setStorageForm((current) => ({ ...current, description: event.target.value }))
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={storageForm.isFavorite}
                  onChange={(event) =>
                    setStorageForm((current) => ({
                      ...current,
                      isFavorite: event.target.checked
                    }))
                  }
                />
              }
              label="Als Favorit für Schnellzugriff markieren"
            />
            {storageForm.id ? (
              <Button
                color="error"
                onClick={() =>
                  storageForm.id && storageForm.updatedAt
                    ? deleteEntity("storage", {
                        id: storageForm.id,
                        updatedAt: storageForm.updatedAt
                      })
                    : undefined
                }
              >
                Aufbewahrungsort löschen
              </Button>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStorageDialogOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={submitStorage} disabled={submitting}>
            Speichern
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={itemDialogOpen} onClose={() => setItemDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{itemForm.id ? "Gegenstand bearbeiten" : "Gegenstand hinzufügen"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <TextField
              select
              label="Aufbewahrungsort"
              value={itemForm.storageLocationId}
              onChange={(event) =>
                setItemForm((current) => ({
                  ...current,
                  storageLocationId: Number(event.target.value)
                }))
              }
            >
              {storageLocations.map((storageLocation) => {
                const room = rooms.find((candidate) => candidate.id === storageLocation.roomId);
                return (
                  <MenuItem key={storageLocation.id} value={storageLocation.id}>
                    {room?.name ? `${room.name} / ` : ""}
                    {storageLocation.name}
                  </MenuItem>
                );
              })}
            </TextField>
            <TextField
              label="Name"
              value={itemForm.name}
              onChange={(event) =>
                setItemForm((current) => ({ ...current, name: event.target.value }))
              }
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Menge"
                type="number"
                value={itemForm.quantity}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, quantity: event.target.value }))
                }
              />
              <TextField
                fullWidth
                select
                label="Einheit"
                value={itemForm.unit}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, unit: event.target.value as ItemUnit }))
                }
              >
                {ITEM_UNITS.map((unit) => (
                  <MenuItem key={unit} value={unit}>
                    {unit}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="Kategorie"
                value={itemForm.category}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, category: event.target.value }))
                }
              />
              <TextField
                fullWidth
                label="Mindestmenge"
                type="number"
                value={itemForm.minimumQuantity}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, minimumQuantity: event.target.value }))
                }
              />
            </Stack>
            <TextField
              label="Ablaufdatum"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={itemForm.expirationDate}
              onChange={(event) =>
                setItemForm((current) => ({ ...current, expirationDate: event.target.value }))
              }
            />
            <TextField
              label="Notizen"
              multiline
              minRows={3}
              value={itemForm.notes}
              onChange={(event) =>
                setItemForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
            {itemForm.id ? (
              <>
                <Divider />
                <Button
                  color="error"
                  onClick={() =>
                    itemForm.id && itemForm.updatedAt
                      ? deleteEntity("item", { id: itemForm.id, updatedAt: itemForm.updatedAt })
                      : undefined
                  }
                >
                  Gegenstand löschen
                </Button>
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemDialogOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={submitItem} disabled={submitting}>
            Speichern
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={moveDialogOpen} onClose={() => setMoveDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Gegenstand verschieben</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <Typography color="text.secondary">
              {moveItemState ? `${moveItemState.name} an einen anderen Aufbewahrungsort verschieben.` : ""}
            </Typography>
            <TextField
              select
              label="Ziel-Aufbewahrungsort"
              value={moveItemState?.targetStorageLocationId ?? ""}
              onChange={(event) =>
                setMoveItemState((current) =>
                  current
                    ? {
                        ...current,
                        targetStorageLocationId: Number(event.target.value)
                      }
                    : current
                )
              }
            >
              {storageLocations.map((storageLocation) => {
                const room = rooms.find((candidate) => candidate.id === storageLocation.roomId);
                return (
                  <MenuItem
                    key={storageLocation.id}
                    value={storageLocation.id}
                    disabled={storageLocation.id === moveItemState?.currentStorageLocationId}
                  >
                    {room?.name ? `${room.name} / ` : ""}
                    {storageLocation.name}
                  </MenuItem>
                );
              })}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveDialogOpen(false)}>Abbrechen</Button>
          <Button
            variant="contained"
            onClick={() => void submitMoveItem()}
            disabled={
              !moveItemState ||
              moveItemState.targetStorageLocationId === moveItemState.currentStorageLocationId
            }
          >
            Verschieben
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        confirmLabel={confirmState?.confirmLabel ?? ""}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => confirmState?.onConfirm()}
      />
    </Box>
  );
}
