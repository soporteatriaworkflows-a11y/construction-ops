/**
 * actions.ts — Server Actions del Quantity Workspace
 * (QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1 §2-§4).
 *
 * Seguridad: modo supabase+db, viewer server-side, rol management|internal,
 * resultado de cada línea recalculado server-side (el navegador nunca lo fija).
 * El sync a BOQ NUNCA escribe sin preview previo confirmado por el usuario.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { InsufficientRoleError } from '@/server/pricing/errors';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import {
  createWorkspaceGroup,
  buildSyncPreview,
  DbQuantityWorkspaceRepository,
  QuantityWorkspaceValidationError,
  QuantityWorkspaceWriteNotSupportedError,
  type WorkspaceGroupDraft,
  type WorkspaceLineDraft,
  type SyncPreviewParams,
} from '@/server/quantity-workspace';
import { QuantityFormulaError } from '@/server/quantity-workspace/formula';
import type { SyncPreviewSummary } from '@/server/quantity-workspace';

export type CreateGroupResult =
  | { ok: true; groupId: string; totalNet: string; lineCount: number }
  | { ok: false; error: string };

export type SyncPreviewResult =
  | { ok: true; summary: SyncPreviewSummary }
  | { ok: false; error: string };

export type SyncConfirmResult =
  | { ok: true; created: number; updated: number }
  | { ok: false; error: string };

function sanitize(e: unknown): string {
  if (
    e instanceof QuantityWorkspaceValidationError ||
    e instanceof QuantityFormulaError ||
    e instanceof QuantityWorkspaceWriteNotSupportedError
  ) {
    return e.message;
  }
  if (e instanceof InsufficientRoleError) {
    return 'Tu rol no permite crear cantidades.';
  }
  if (e instanceof AuthError) return 'Error al verificar la sesión.';
  return 'No se pudo completar la operación. Verifica los datos e intenta de nuevo.';
}

/** Crea un grupo de cantidades manual desde el payload JSON del formulario. */
export async function createWorkspaceGroupAction(formData: FormData): Promise<CreateGroupResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'Requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  let draft: WorkspaceGroupDraft;
  try {
    const raw = formData.get('payload');
    if (typeof raw !== 'string') return { ok: false, error: 'Payload inválido.' };
    draft = parseDraft(JSON.parse(raw));
  } catch {
    return { ok: false, error: 'No se pudo leer el formulario.' };
  }
  try {
    const viewer = await resolveAuthenticatedViewer();
    const result = await createWorkspaceGroup(viewer, draft);
    revalidatePath('/quantities/workspace');
    return { ok: true, groupId: result.groupId, totalNet: result.totalNet, lineCount: result.lineCount };
  } catch (e) {
    return { ok: false, error: sanitize(e) };
  }
}

export type LoadChaptersResult =
  | { ok: true; chapters: Array<{ id: string; code: string; name: string }> }
  | { ok: false; error: string };

/** Capítulos de una versión (para elegir destino al crear ítems BOQ). */
export async function loadChaptersAction(versionId: string): Promise<LoadChaptersResult> {
  try {
    const viewer = await resolveAuthenticatedViewer();
    const repo = new DbQuantityWorkspaceRepository();
    const chapters = await repo.chaptersForVersion(viewer, versionId);
    return {
      ok: true,
      chapters: chapters.map((c) => ({ id: c.id, code: c.code, name: c.name })),
    };
  } catch (e) {
    return { ok: false, error: sanitize(e) };
  }
}

/** Construye el preview de sync (read-only). NO escribe nada. */
export async function buildSyncPreviewAction(
  params: SyncPreviewParams,
): Promise<SyncPreviewResult> {
  try {
    const viewer = await resolveAuthenticatedViewer();
    const summary = await buildSyncPreview(viewer, params);
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: sanitize(e) };
  }
}

/**
 * Confirma el sync: ejecuta create/update por cada fila NO bloqueada que el
 * usuario aprobó. Se re-valida el estado server-side (RPC con guards).
 */
export async function confirmSyncAction(input: {
  versionId: string;
  rows: Array<{
    workspaceLineId: string;
    action: 'create' | 'update';
    boqItemId: string | null;
    apuTemplateId: string | null;
    chapterId: string | null;
    quantity: string;
  }>;
}): Promise<SyncConfirmResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'Requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  try {
    const viewer = await resolveAuthenticatedViewer();
    const repo = new DbQuantityWorkspaceRepository();
    let created = 0;
    let updated = 0;
    for (const row of input.rows) {
      if (row.action === 'update' && row.boqItemId) {
        await repo.updateBoqItemQuantity(viewer, {
          boqItemId: row.boqItemId,
          quantity: row.quantity,
          idempotencyKey: `wsq:${row.workspaceLineId}:${row.quantity}`,
        });
        updated += 1;
      } else if (row.action === 'create' && row.apuTemplateId && row.chapterId) {
        await repo.createBoqItemFromLine(viewer, {
          estimateVersionId: input.versionId,
          chapterId: row.chapterId,
          apuTemplateId: row.apuTemplateId,
          quantity: row.quantity,
          workspaceLineId: row.workspaceLineId,
          idempotencyKey: `wsc:${row.workspaceLineId}:${row.quantity}`,
        });
        created += 1;
      }
    }
    revalidatePath('/quantities/workspace');
    return { ok: true, created, updated };
  } catch (e) {
    return { ok: false, error: sanitize(e) };
  }
}

function asStr(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  return null;
}

function parseDraft(obj: unknown): WorkspaceGroupDraft {
  if (typeof obj !== 'object' || obj === null) {
    throw new QuantityWorkspaceValidationError('Formulario vacío');
  }
  const o = obj as Record<string, unknown>;
  const linesRaw = Array.isArray(o.lines) ? o.lines : [];
  const lines: WorkspaceLineDraft[] = linesRaw.map((lr) => {
    const l = (typeof lr === 'object' && lr !== null ? lr : {}) as Record<string, unknown>;
    return {
      description: asStr(l.description),
      resultUnit: asStr(l.resultUnit),
      formulaType: String(l.formulaType ?? '') as WorkspaceLineDraft['formulaType'],
      length: asStr(l.length),
      width: asStr(l.width),
      height: asStr(l.height),
      thickness: asStr(l.thickness),
      count: asStr(l.count),
      partialHeight: asStr(l.partialHeight),
      wastePct: asStr(l.wastePct),
      openingDeduction: asStr(l.openingDeduction),
      apuTemplateId: asStr(l.apuTemplateId),
      notes: asStr(l.notes),
    };
  });
  return {
    projectScopeId: asStr(o.projectScopeId) ?? '',
    code: asStr(o.code) ?? '',
    name: asStr(o.name) ?? '',
    floor: asStr(o.floor),
    module: asStr(o.module),
    space: asStr(o.space),
    element: asStr(o.element),
    description: asStr(o.description),
    resultUnit: asStr(o.resultUnit) ?? '',
    templateKind: o.templateKind === 'mixed_wall' ? 'mixed_wall' : 'generic',
    lines,
  };
}
