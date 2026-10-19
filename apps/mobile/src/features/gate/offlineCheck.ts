import type { GateKey } from "@outpassed/shared";
import { api } from "../../api/client";
import { readJson, writeJson } from "../../lib/store";

/**
 * What the guard's phone needs to check passes with no internet: the
 * server's public key, and the last movement it recorded for each pass (so
 * someone let out offline is let back in).
 */
const KEY = "outpass.gateKey";
const MOVES = "outpass.localMoves";

type Moves = Record<string, { d: "EXIT" | "ENTRY"; at: number }>;

let key: GateKey | null = null;
let moves: Moves | null = null;

export async function refreshGateKey(token: string): Promise<void> {
  const fresh = await api.gateKey(token);
  key = fresh;
  await writeJson(KEY, fresh);
}

export async function gateKey(): Promise<GateKey | null> {
  return (key ??= await readJson<GateKey>(KEY));
}

async function loadMoves(): Promise<Moves> {
  return (moves ??= (await readJson<Moves>(MOVES)) ?? {});
}

export async function lastLocalMove(subjectId: string): Promise<"EXIT" | "ENTRY" | undefined> {
  return (await loadMoves())[subjectId]?.d;
}

export async function recordLocalMove(subjectId: string, d: "EXIT" | "ENTRY"): Promise<void> {
  const m = await loadMoves();
  m[subjectId] = { d, at: Date.now() };
  // Keep two days, at most 300 passes.
  const cutoff = Date.now() - 2 * 86_400_000;
  const kept = Object.entries(m)
    .filter(([, v]) => v.at > cutoff)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 300);
  moves = Object.fromEntries(kept);
  await writeJson(MOVES, moves);
}
