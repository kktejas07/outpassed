import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

/**
 * Gate photos waiting to upload (the movement was saved offline, or the
 * upload failed). Saved to the phone so closing the app before the signal
 * comes back doesn't lose them: one file per photo on iOS and Android, browser
 * storage on the web. Best-effort: if storage fails we still try from memory.
 */
export type PendingPhoto = { eventId: string; image: string };

const WEB_KEY = "outpass.gatePhotos";
/** A day of gate photos at a busy gate is well under this. */
const MAX = 200;
let memory: PendingPhoto[] = [];
let loaded = false;

const dir = () => new Directory(Paths.document, "gate-photos");
const fileFor = (eventId: string) => new File(dir(), `${eventId.replace(/[^\w-]/g, "")}.b64`);

function saveWeb() {
  try {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(memory.slice(-60)));
  } catch {
    // Quota full: keep what's in memory.
  }
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (Platform.OS === "web") {
      const raw = globalThis.localStorage?.getItem(WEB_KEY);
      const saved = raw ? (JSON.parse(raw) as PendingPhoto[]) : [];
      memory = [...saved, ...memory.filter((m) => !saved.some((s) => s.eventId === m.eventId))];
      return;
    }
    const d = dir();
    if (!d.exists) return;
    for (const entry of d.list()) {
      if (!(entry instanceof File) || !entry.name.endsWith(".b64")) continue;
      const eventId = entry.name.slice(0, -4);
      if (memory.some((m) => m.eventId === eventId)) continue;
      memory.push({ eventId, image: await entry.text() });
    }
  } catch {
    // Unreadable storage: carry on with what's in memory.
  }
}

export async function addPendingPhoto(p: PendingPhoto) {
  await load();
  memory = [...memory.filter((m) => m.eventId !== p.eventId), p].slice(-MAX);
  try {
    if (Platform.OS === "web") saveWeb();
    else {
      const d = dir();
      if (!d.exists) d.create({ intermediates: true });
      await fileFor(p.eventId).write(p.image);
    }
  } catch {
    // Kept in memory.
  }
}

export async function pendingPhotos(): Promise<PendingPhoto[]> {
  await load();
  return [...memory];
}

export function removePendingPhoto(eventId: string) {
  memory = memory.filter((m) => m.eventId !== eventId);
  try {
    if (Platform.OS === "web") saveWeb();
    else {
      const f = fileFor(eventId);
      if (f.exists) f.delete();
    }
  } catch {
    // Nothing else to do.
  }
}
