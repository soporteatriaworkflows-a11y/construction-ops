/**
 * fixture-repository.ts — Repositorio demo de Quick Notes (V5.4.2b).
 *
 * READ_MODEL_SOURCE=fixture ⇒ lectura demo determinista; TODA escritura está
 * deshabilitada (`QuickNoteWriteNotSupportedError`). Respeta el guard de privacidad:
 * un viewer del bucket client-safe NO ve notas.
 */
import { QuickNoteWriteNotSupportedError } from './errors';
import { canViewQuickNotes } from './guard';
import { QUICK_NOTES_DASHBOARD_LIMIT } from './types';
import type {
  AuthenticatedViewer,
  CreateQuickNoteInput,
  ListQuickNotesOptions,
  QuickNoteView,
  QuickNotesRepository,
  Uuid,
} from './types';

const DEMO_CREATOR = '00000000-0000-0000-0000-0000000000d1';

const DEMO_NOTES: QuickNoteView[] = [
  {
    id: '00000000-0000-0000-0000-000000003001',
    body: 'Revisar cotización de acero con proveedor alterno.',
    status: 'active',
    projectId: null,
    estimateId: null,
    createdBy: DEMO_CREATOR,
    createdAt: '2026-06-20T14:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000003002',
    body: 'Validar AIU del presupuesto activo antes de emitir.',
    status: 'active',
    projectId: null,
    estimateId: null,
    createdBy: DEMO_CREATOR,
    createdAt: '2026-06-19T09:30:00.000Z',
  },
];

export class FixtureQuickNotesRepository implements QuickNotesRepository {
  readonly source = 'fixture' as const;

  async listQuickNotes(viewer: AuthenticatedViewer, options: ListQuickNotesOptions = {}): Promise<QuickNoteView[]> {
    if (!canViewQuickNotes(viewer.role)) return [];
    const limit = options.limit ?? QUICK_NOTES_DASHBOARD_LIMIT;
    return DEMO_NOTES.filter((n) => n.status === 'active')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async createQuickNote(_viewer: AuthenticatedViewer, _input: CreateQuickNoteInput): Promise<QuickNoteView> {
    throw new QuickNoteWriteNotSupportedError();
  }

  async archiveQuickNote(_viewer: AuthenticatedViewer, _noteId: Uuid): Promise<QuickNoteView> {
    throw new QuickNoteWriteNotSupportedError();
  }
}
