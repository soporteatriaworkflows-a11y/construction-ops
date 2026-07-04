/**
 * use-manual-takeoffs.ts — localStorage como external store (F3).
 *
 * `useSyncExternalStore` en lugar de useState+useEffect: sin setState en
 * efectos (regla react-hooks/set-state-in-effect), sin mismatch de hidratación
 * (snapshot de servidor = lista vacía) y con sincronización entre pestañas vía
 * evento `storage`. Toda escritura pasa por `writeManualTakeoffs`, que persiste
 * y notifica a los suscriptores.
 */
'use client';

import { useSyncExternalStore } from 'react';
import type { ManualTakeoffRecord } from './manual-takeoff';
import {
  MANUAL_TAKEOFFS_STORAGE_KEY,
  parseStoredManualTakeoffs,
  saveManualTakeoffs,
} from './manual-store';

const EMPTY: readonly ManualTakeoffRecord[] = [];

/** Snapshot cacheado por raw string: `getSnapshot` debe devolver referencias estables. */
let cache: { raw: string | null; records: readonly ManualTakeoffRecord[] } = {
  raw: null,
  records: EMPTY,
};

const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(MANUAL_TAKEOFFS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): readonly ManualTakeoffRecord[] {
  const raw = readRaw();
  if (cache.raw !== raw) {
    cache = { raw, records: parseStoredManualTakeoffs(raw) };
  }
  return cache.records;
}

function getServerSnapshot(): readonly ManualTakeoffRecord[] {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Cambios hechos desde OTRA pestaña del mismo navegador.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === MANUAL_TAKEOFFS_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Única puerta de escritura: persiste en localStorage y notifica a los hooks. */
export function writeManualTakeoffs(records: readonly ManualTakeoffRecord[]): void {
  saveManualTakeoffs(records);
  for (const listener of [...listeners]) listener();
}

export function useManualTakeoffs(): {
  takeoffs: readonly ManualTakeoffRecord[];
  /** false durante SSR/hidratación inicial: distingue "aún no leí localStorage" de "no existe". */
  hydrated: boolean;
} {
  const takeoffs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return { takeoffs, hydrated };
}
