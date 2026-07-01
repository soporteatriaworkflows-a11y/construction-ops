/**
 * dashboard-card.test.ts — NotesCard conectado + subcomponentes client + wiring del
 * dashboard (V5.4.2c). Stack node: checks de FUENTE (presentacional, sin jsdom), igual
 * que inline-callout/premium-system. La lógica conductual (repository/actions/errores
 * curados) está cubierta por tests/unit/quick-notes/{repository,action-result}.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

const CARD = read('../../../components/shared/notes-card.tsx');
const CREATE = read('../../../components/shared/quick-note-create-form.tsx');
const ARCHIVE = read('../../../components/shared/quick-note-archive-button.tsx');
const TIMELINE = read('../../../components/shared/operations-timeline-card.tsx');
const PAGE = read('../../../app/(dashboard)/dashboard/page.tsx');

/** No debe filtrarse ningún tecnicismo de Postgres/RLS en la UI. */
const TECHNICAL = /(42501|23514|row-level security|SQLSTATE|pg_policies|violates|permission denied|quick_notes_insert|current_role\(\))/i;

describe('NotesCard — Server Component conectado', () => {
  it('dejó de ser estático: sin EXAMPLE_NOTES; es Server Component (sin "use client")', () => {
    expect(CARD).not.toContain('EXAMPLE_NOTES');
    expect(CARD).not.toContain("'use client'");
    expect(CARD).toContain('export function NotesCard');
  });

  it('muestra notas reales (map body + fecha)', () => {
    expect(CARD).toContain('notes.map(');
    expect(CARD).toContain('{note.body}');
    expect(CARD).toContain('formatDate(note.createdAt)');
  });

  it('estado vacío honesto, sin datos fake', () => {
    expect(CARD).toContain('Sin notas internas activas');
    expect(CARD).toMatch(/notes\.length > 0\s*\?/);
  });

  it('crear y archivar gateados por canCreate (viewer interno)', () => {
    expect(CARD).toMatch(/canCreate && <QuickNoteCreateForm/);
    expect(CARD).toMatch(/canCreate && <QuickNoteArchiveButton/);
    expect(CARD).toContain('createAction');
    expect(CARD).toContain('archiveAction');
  });

  it('NO edita body: lo muestra de solo lectura (sin input/textarea en el card)', () => {
    expect(CARD).not.toContain('<textarea');
    expect(CARD).not.toContain('<input');
    expect(CARD).not.toMatch(/updateNote|editNote|editBody/i);
  });
});

describe('QuickNoteCreateForm — client aislado', () => {
  it("es 'use client' y usa useActionState con la action por prop", () => {
    expect(CREATE).toContain("'use client'");
    expect(CREATE).toContain('useActionState(action');
  });

  it('textarea name="body" con maxLength; deshabilita mientras guarda (sin doble submit)', () => {
    expect(CREATE).toContain('name="body"');
    expect(CREATE).toContain('QUICK_NOTE_BODY_MAX');
    expect(CREATE).toMatch(/disabled=\{isPending\}/);
  });

  it('muestra errores CURADOS (fieldErrors/error), sin tecnicismos', () => {
    expect(CREATE).toMatch(/fieldErrors\?\.body\s*\?\?\s*state\?\.error/);
    expect(TECHNICAL.test(CREATE)).toBe(false);
  });

  it("NO importa el barrel '@/server/quick-notes' (arrastraría server-only al bundle cliente)", () => {
    expect(CREATE).not.toMatch(/from '@\/server\/quick-notes'/);
    expect(ARCHIVE).not.toMatch(/from '@\/server\/quick-notes'/);
  });
});

describe('QuickNoteArchiveButton — client aislado', () => {
  it("es 'use client', useActionState, noteId oculto y deshabilita mientras archiva", () => {
    expect(ARCHIVE).toContain("'use client'");
    expect(ARCHIVE).toContain('useActionState(action');
    expect(ARCHIVE).toContain('name="noteId"');
    expect(ARCHIVE).toMatch(/disabled=\{isPending\}/);
  });

  it('muestra error curado, sin tecnicismos', () => {
    expect(ARCHIVE).toContain('state?.error');
    expect(TECHNICAL.test(ARCHIVE)).toBe(false);
  });
});

describe('Dashboard page — wiring + privacidad', () => {
  it('importa guard y lectura de notas + las server actions', () => {
    expect(PAGE).toContain('getDashboardQuickNotes');
    expect(PAGE).toContain('canViewQuickNotes');
    expect(PAGE).toContain('canCreateQuickNotes');
    expect(PAGE).toContain("from './notes-actions'");
    expect(PAGE).toContain('createQuickNoteAction');
    expect(PAGE).toContain('archiveQuickNoteAction');
  });

  it('privacidad: solo llama al repositorio y renderiza el card si canViewNotes (client no)', () => {
    // el fetch ocurre dentro del guard canViewNotes
    expect(PAGE).toMatch(/if \(canViewNotes\)\s*\{[\s\S]*getDashboardQuickNotes/);
    // el card SOLO se renderiza bajo canViewNotes
    expect(PAGE).toMatch(/canViewNotes && \(\s*<NotesCard/);
  });

  it('pasa notas + canCreate + actions al card', () => {
    expect(PAGE).toMatch(/<NotesCard[\s\S]*notes=\{quickNotes\}[\s\S]*canCreate=\{canCreateNotes\}/);
    expect(PAGE).toMatch(/createAction=\{createQuickNoteAction\}/);
    expect(PAGE).toMatch(/archiveAction=\{archiveQuickNoteAction\}/);
  });

  it('lectura tolerante a fallo (no rompe el dashboard)', () => {
    expect(PAGE).toMatch(/try \{[\s\S]*getDashboardQuickNotes[\s\S]*\} catch \{[\s\S]*quickNotes = \[\]/);
  });
});

describe('Layout patch — Quick Notes NO estira los KPIs', () => {
  it('el panel de KPIs (Fila B) ya NO comparte grid con Quick Notes (sin col-span condicional)', () => {
    expect(PAGE).not.toMatch(/canViewNotes \? 'lg:col-span-2' : 'lg:col-span-3'/);
    // Quick Notes se movió a una sección inferior "Pulso operativo"
    expect(PAGE).toContain('Pulso operativo');
  });

  it('Quick Notes es angosto (col-span-4) en un grid de 12; timeline ocupa el resto', () => {
    expect(PAGE).toMatch(/lg:grid-cols-12/);
    expect(PAGE).toMatch(/<NotesCard\s+className="lg:col-span-4"/);
    expect(PAGE).toMatch(/canViewNotes \? 'lg:col-span-8' : 'lg:col-span-12'/);
  });

  it('pieza longitudinal derecha: OperationsTimelineCard como shell honesto (sin datos fake)', () => {
    expect(PAGE).toContain('<OperationsTimelineCard');
    expect(TIMELINE).toContain('Línea de tiempo operativa');
    expect(TIMELINE).toContain('Próximamente');
    // solo consume datos ya disponibles por prop; no crea queries ni toca el server
    expect(TIMELINE).not.toMatch(/createClient|getDashboard|from '@\/server\//);
  });

  it('NotesCard compacto: lista con altura máxima + scroll interno (no estira)', () => {
    expect(CARD).toMatch(/max-h-\d+/);
    expect(CARD).toContain('overflow-y-auto');
  });
});
