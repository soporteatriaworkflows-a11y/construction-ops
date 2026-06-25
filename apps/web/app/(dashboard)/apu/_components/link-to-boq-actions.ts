/**
 * link-to-boq-actions.ts — Vincular un APU de la Biblioteca (vista Tarjetas) a un
 * BOQ editable (APU_LIBRARY_BOQ_LINK_FROM_CARDS_V1).
 *
 * REUSO, no nueva mutación: el alta la realiza el dominio existente
 * `addApuToBoq` → RPC `add_apu_to_boq` (snapshot server-side, solo versión
 * editable, rol management|internal, idempotente y auditado). Aquí solo hay:
 *   - lecturas guiadas (proyecto → versión editable → capítulos/ítems) sobre el
 *     read-model existente, y
 *   - un wrapper mínimo de mutación que delega en `addApuToBoq` (cero lógica
 *     financiera nueva) y revalida `/apu` + la vista del proyecto.
 */
'use server';

import { revalidatePath } from 'next/cache';
import {
  resolveAuthenticatedViewer,
  toViewerContext,
} from '@/server/auth/resolve-viewer';
import { getReadModel } from '@/server/read-model';
import {
  addApuToBoq,
  ApuBuilderValidationError,
  ApuBuilderWriteNotSupportedError,
} from '@/server/apu-builder';
import { InsufficientRoleError } from '@/server/pricing/errors';
import { isEditableVersionStatus, versionStatusLabel } from '@/lib/apu-library/boq-link';
import type { EstimateVersionStatus } from '@/lib/utils/types';

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

/* ---------------------------------------------------------------------------
 * Lecturas guiadas (solo lectura — no mutan nada)
 * ------------------------------------------------------------------------ */

export interface LinkProjectOption {
  id: string;
  name: string;
  estimateCount: number;
}

export type LoadProjectsResult =
  | { ok: true; projects: LinkProjectOption[] }
  | { ok: false; error: string };

export async function loadLinkProjectsAction(): Promise<LoadProjectsResult> {
  try {
    const viewer = await resolveAuthenticatedViewer();
    const projects = await getReadModel().listProjects(toViewerContext(viewer));
    return {
      ok: true,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        estimateCount: p.estimateCount,
      })),
    };
  } catch {
    return { ok: false, error: 'No se pudieron cargar los proyectos.' };
  }
}

export interface LinkVersionOption {
  versionId: string;
  estimateId: string;
  versionNumber: number;
  status: EstimateVersionStatus;
  statusLabel: string;
  editable: boolean;
  label: string;
}

export type LoadVersionsResult =
  | { ok: true; versions: LinkVersionOption[] }
  | { ok: false; error: string };

export async function loadLinkVersionsAction(projectId: string): Promise<LoadVersionsResult> {
  if (!projectId) return { ok: true, versions: [] };
  try {
    const viewer = await resolveAuthenticatedViewer();
    const estimates = await getReadModel().listEstimates(toViewerContext(viewer), projectId);
    const versions = estimates.map((e) => {
      const editable = isEditableVersionStatus(e.status);
      const statusLabel = versionStatusLabel(e.status);
      return {
        versionId: e.versionId,
        estimateId: e.estimateId,
        versionNumber: e.versionNumber,
        status: e.status,
        statusLabel,
        editable,
        label: `Versión ${e.versionNumber} · ${statusLabel}${editable ? '' : ' (bloqueada)'}`,
      };
    });
    return { ok: true, versions };
  } catch {
    return { ok: false, error: 'No se pudieron cargar las versiones del presupuesto.' };
  }
}

export interface LinkChapterOption {
  id: string;
  code: string;
  name: string;
  itemCount: number;
}

export interface LinkBoqItemRef {
  id: string;
  chapterId: string;
  code: string;
  description: string;
  unit: string;
  quantity: string;
}

export type LoadChaptersResult =
  | { ok: true; chapters: LinkChapterOption[]; items: LinkBoqItemRef[] }
  | { ok: false; error: string };

export async function loadLinkChaptersAction(versionId: string): Promise<LoadChaptersResult> {
  if (!versionId) return { ok: true, chapters: [], items: [] };
  try {
    const viewer = await resolveAuthenticatedViewer();
    const detail = await getReadModel().getEstimateDetail(toViewerContext(viewer), versionId);
    return {
      ok: true,
      chapters: detail.chapters.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        itemCount: c.itemCount,
      })),
      items: detail.items.map((it) => ({
        id: it.id,
        chapterId: it.chapterId,
        code: it.code,
        description: it.description,
        unit: it.unit,
        quantity: it.quantity,
      })),
    };
  } catch {
    return { ok: false, error: 'No se pudo cargar el contenido del presupuesto.' };
  }
}

/* ---------------------------------------------------------------------------
 * Mutación (wrapper mínimo sobre el dominio existente)
 * ------------------------------------------------------------------------ */

export type LinkApuToBoqActionResult =
  | { ok: true; message: string; subtotal: string; projectId: string; apuTemplateId: string }
  | { ok: false; error: string };

export async function linkApuToBoqAction(
  _prev: LinkApuToBoqActionResult | null,
  formData: FormData,
): Promise<LinkApuToBoqActionResult> {
  const estimateVersionId = s(formData, 'estimateVersionId');
  const chapterId = s(formData, 'chapterId');
  const apuTemplateId = s(formData, 'apuTemplateId');
  const quantity = s(formData, 'quantity');
  const idempotencyKey = s(formData, 'idempotencyKey') || undefined;
  const projectId = s(formData, 'projectId');

  try {
    const viewer = await resolveAuthenticatedViewer();
    const result = await addApuToBoq(viewer, {
      estimateVersionId,
      chapterId,
      apuTemplateId,
      quantity,
      idempotencyKey,
    });

    revalidatePath('/apu');
    if (projectId) revalidatePath(`/projects/${projectId}`);

    return {
      ok: true,
      message: 'APU vinculado al ítem BOQ.',
      subtotal: result.subtotal,
      projectId,
      apuTemplateId,
    };
  } catch (e) {
    if (e instanceof ApuBuilderValidationError) return { ok: false, error: e.message };
    if (e instanceof InsufficientRoleError) {
      return { ok: false, error: 'No tienes permiso para editar este presupuesto.' };
    }
    if (e instanceof ApuBuilderWriteNotSupportedError) {
      return { ok: false, error: 'Esta operación requiere modo Supabase + base de datos.' };
    }
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('version_locked')) {
      return { ok: false, error: 'La versión está bloqueada (emitida/aprobada) y no admite cambios.' };
    }
    if (msg.includes('chapter_not_in_version')) {
      return { ok: false, error: 'El capítulo no pertenece a esta versión.' };
    }
    if (msg.includes('apu_not_found')) {
      return { ok: false, error: 'El APU seleccionado no está disponible.' };
    }
    return { ok: false, error: 'No se pudo vincular el APU. Inténtalo de nuevo.' };
  }
}
