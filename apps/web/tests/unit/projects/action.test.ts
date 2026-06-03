/**
 * action.test.ts — Pruebas de la lógica del server action de creación de proyectos.
 *
 * Propiedad: agent-frontend-boq. Oleada 4B.1.
 *
 * Qué se prueba (funciones puras y lógica de la action sin ejecutar Next.js):
 *  - `isCreationModeEnabled`: habilitado solo con supabase+db.
 *  - `createProjectAction` (vía mock): validación, auth deny, modo demo, redirect seguro.
 *
 * Restricciones del entorno: NO hay @testing-library/react ni jsdom.
 * NO se instalan dependencias adicionales. Se usan mocks de Vitest.
 *
 * `redirect` y `revalidatePath` de next/navigation / next/cache se mockean para evitar
 * que el action tire NEXT_REDIRECT en tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';

// ─── Mocks de módulos de Next.js ────────────────────────────────────────────
// redirect() en server actions lanza NEXT_REDIRECT; lo capturamos como mock.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// ─── Mocks del viewer y repositorio ─────────────────────────────────────────
vi.mock('@/server/auth/resolve-viewer', () => ({
  resolveAuthenticatedViewer: vi.fn(),
  resolveViewer: vi.fn(),
  toViewerContext: vi.fn(),
}));

vi.mock('@/server/projects', () => ({
  getProjectsWriteRepository: vi.fn(),
  ProjectValidationError: class ProjectValidationError extends Error {
    code = 'project_validation' as const;
    issues: { field: string; message: string }[];
    constructor(issues: { field: string; message: string }[]) {
      super('project_validation');
      this.name = 'ProjectValidationError';
      this.issues = issues;
    }
  },
  ProjectWriteNotSupportedError: class ProjectWriteNotSupportedError extends Error {
    code = 'project_write_not_supported' as const;
    constructor() {
      super('project_write_not_supported');
      this.name = 'ProjectWriteNotSupportedError';
    }
  },
  ProjectNotFoundError: class ProjectNotFoundError extends Error {
    code = 'project_not_found' as const;
    constructor(id: string) {
      super(`project_not_found:${id}`);
      this.name = 'ProjectNotFoundError';
    }
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Construye un FormData con los campos permitidos (sin org_id, created_by, etc.) */
function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
}

// ─── Tests de `isCreationModeEnabled` ────────────────────────────────────────
describe('isCreationModeEnabled', () => {
  it('supabase + db ⇒ true', () => {
    expect(
      isCreationModeEnabled({
        APP_AUTH_MODE: 'supabase',
        READ_MODEL_SOURCE: 'db',
      }),
    ).toBe(true);
  });

  it('demo + fixture ⇒ false', () => {
    expect(
      isCreationModeEnabled({
        APP_AUTH_MODE: 'demo',
        READ_MODEL_SOURCE: 'fixture',
      }),
    ).toBe(false);
  });

  it('supabase + fixture ⇒ false', () => {
    expect(
      isCreationModeEnabled({
        APP_AUTH_MODE: 'supabase',
        READ_MODEL_SOURCE: 'fixture',
      }),
    ).toBe(false);
  });

  it('demo + db ⇒ false (combinación prohibida)', () => {
    expect(
      isCreationModeEnabled({
        APP_AUTH_MODE: 'demo',
        READ_MODEL_SOURCE: 'db',
      }),
    ).toBe(false);
  });

  it('sin variables ⇒ false (defaults: demo + fixture)', () => {
    expect(isCreationModeEnabled({})).toBe(false);
  });
});

// ─── Tests de `createProjectAction` ──────────────────────────────────────────
describe('createProjectAction', () => {
  // Importar la action y los mocks dentro del describe para tener acceso al mock
  let createProjectAction: typeof import('@/app/(dashboard)/projects/actions').createProjectAction;
  let resolveAuthenticatedViewerMock: ReturnType<typeof vi.fn>;
  let getProjectsWriteRepositoryMock: ReturnType<typeof vi.fn>;
  let redirectMock: ReturnType<typeof vi.fn>;
  let revalidatePathMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Importación dinámica para que los mocks ya estén en efecto
    const actionsModule = await import('@/app/(dashboard)/projects/actions');
    createProjectAction = actionsModule.createProjectAction;

    const authModule = await import('@/server/auth/resolve-viewer');
    resolveAuthenticatedViewerMock = vi.mocked(authModule.resolveAuthenticatedViewer);

    const projectsModule = await import('@/server/projects');
    getProjectsWriteRepositoryMock = vi.mocked(projectsModule.getProjectsWriteRepository);

    const navModule = await import('next/navigation');
    redirectMock = vi.mocked(navModule.redirect);

    const cacheModule = await import('next/cache');
    revalidatePathMock = vi.mocked(cacheModule.revalidatePath);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('retorna error claro en modo demo (sin session check)', async () => {
    // Simular modo demo/fixture
    vi.stubEnv('APP_AUTH_MODE', 'demo');
    vi.stubEnv('READ_MODEL_SOURCE', 'fixture');

    const fd = makeFormData({ name: 'Proyecto X', city: 'Bogotá' });
    const result = await createProjectAction(null, fd);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/modo demostración/i);
    // No debe llamar al viewer ni al repositorio
    expect(resolveAuthenticatedViewerMock).not.toHaveBeenCalled();
    expect(getProjectsWriteRepositoryMock).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it('retorna error de auth cuando no hay sesión (AuthError: no_session)', async () => {
    vi.stubEnv('APP_AUTH_MODE', 'supabase');
    vi.stubEnv('READ_MODEL_SOURCE', 'db');

    const { AuthError } = await import('@/server/auth/errors');
    resolveAuthenticatedViewerMock.mockRejectedValueOnce(
      new AuthError('no_session', 'No hay sesión válida.'),
    );

    const fd = makeFormData({ name: 'X', city: 'Y' });
    const result = await createProjectAction(null, fd);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sesión/i);
    expect(getProjectsWriteRepositoryMock).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it('retorna error de auth cuando no hay membresía (AuthError: no_membership)', async () => {
    vi.stubEnv('APP_AUTH_MODE', 'supabase');
    vi.stubEnv('READ_MODEL_SOURCE', 'db');

    const { AuthError } = await import('@/server/auth/errors');
    resolveAuthenticatedViewerMock.mockRejectedValueOnce(
      new AuthError('no_membership', 'Sin membresía.'),
    );

    const fd = makeFormData({ name: 'X', city: 'Y' });
    const result = await createProjectAction(null, fd);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/membresía/i);

    vi.unstubAllEnvs();
  });

  it('retorna fieldErrors cuando el input es inválido (nombre vacío)', async () => {
    vi.stubEnv('APP_AUTH_MODE', 'supabase');
    vi.stubEnv('READ_MODEL_SOURCE', 'db');

    resolveAuthenticatedViewerMock.mockResolvedValueOnce({
      userId: 'u-1',
      profileId: 'p-1',
      organizationId: 'org-1',
      role: 'management',
    });

    const { ProjectValidationError } = await import('@/server/projects');
    const mockRepo = {
      createProject: vi.fn().mockRejectedValueOnce(
        new ProjectValidationError([{ field: 'name', message: 'El nombre es obligatorio.' }]),
      ),
      getProjectById: vi.fn(),
    };
    getProjectsWriteRepositoryMock.mockReturnValueOnce(mockRepo);

    const fd = makeFormData({ name: '', city: 'Bogotá' });
    const result = await createProjectAction(null, fd);

    expect(result.success).toBe(false);
    expect(result.fieldErrors?.name).toBe('El nombre es obligatorio.');

    vi.unstubAllEnvs();
  });

  it('NUNCA lee organization_id, created_by, code, id del FormData', async () => {
    vi.stubEnv('APP_AUTH_MODE', 'supabase');
    vi.stubEnv('READ_MODEL_SOURCE', 'db');

    const capturedInput: Record<string, unknown>[] = [];
    resolveAuthenticatedViewerMock.mockResolvedValueOnce({
      userId: 'u-1',
      profileId: 'p-1',
      organizationId: 'org-1',
      role: 'management',
    });

    const mockRepo = {
      createProject: vi.fn().mockImplementationOnce(
        (_viewer: unknown, input: Record<string, unknown>) => {
          capturedInput.push({ ...input });
          return Promise.resolve({
            id: 'proj-1',
            name: 'X',
            city: 'Y',
            description: null,
            status: 'active',
            createdAt: '2026-06-02T00:00:00Z',
          });
        },
      ),
      getProjectById: vi.fn(),
    };
    getProjectsWriteRepositoryMock.mockReturnValueOnce(mockRepo);

    // Intentar enviar campos espurios en el FormData
    const fd = makeFormData({
      name: 'Proyecto Legítimo',
      city: 'Bogotá',
      organization_id: 'org-EVIL',
      created_by: 'p-EVIL',
      code: 'HACK',
      id: 'id-EVIL',
      role: 'management',
    });

    try {
      await createProjectAction(null, fd);
    } catch (e) {
      // Se espera NEXT_REDIRECT tras éxito
      if (!(e instanceof Error && e.message.startsWith('NEXT_REDIRECT'))) {
        throw e;
      }
    }

    // Verificar que el input pasado al repo no contiene campos espurios
    const sentInput = capturedInput[0]!;
    expect(sentInput).not.toHaveProperty('organization_id');
    expect(sentInput).not.toHaveProperty('created_by');
    expect(sentInput).not.toHaveProperty('code');
    expect(sentInput).not.toHaveProperty('id');
    expect(sentInput.name).toBe('Proyecto Legítimo');
    expect(sentInput.city).toBe('Bogotá');

    vi.unstubAllEnvs();
  });

  it('en éxito: revalida /projects y redirige a /projects/<id>', async () => {
    vi.stubEnv('APP_AUTH_MODE', 'supabase');
    vi.stubEnv('READ_MODEL_SOURCE', 'db');

    resolveAuthenticatedViewerMock.mockResolvedValueOnce({
      userId: 'u-1',
      profileId: 'p-1',
      organizationId: 'org-1',
      role: 'management',
    });

    const mockRepo = {
      createProject: vi.fn().mockResolvedValueOnce({
        id: 'proj-abc',
        name: 'Torre Norte',
        city: 'Bogotá',
        description: null,
        status: 'active',
        createdAt: '2026-06-02T00:00:00Z',
      }),
      getProjectById: vi.fn(),
    };
    getProjectsWriteRepositoryMock.mockReturnValueOnce(mockRepo);

    const fd = makeFormData({ name: 'Torre Norte', city: 'Bogotá' });

    let redirectCalled = false;
    let redirectPath = '';
    redirectMock.mockImplementationOnce((path: string) => {
      redirectCalled = true;
      redirectPath = path;
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    try {
      await createProjectAction(null, fd);
    } catch (e) {
      if (!(e instanceof Error && e.message.startsWith('NEXT_REDIRECT'))) {
        throw e;
      }
    }

    expect(revalidatePathMock).toHaveBeenCalledWith('/projects');
    expect(redirectCalled).toBe(true);
    expect(redirectPath).toBe('/projects/proj-abc');
    // Sin open redirect: la ruta empieza con /projects/ (interna)
    expect(redirectPath.startsWith('/projects/')).toBe(true);

    vi.unstubAllEnvs();
  });

  it('error genérico del repositorio ⇒ mensaje sanitizado (sin SQL/stack)', async () => {
    vi.stubEnv('APP_AUTH_MODE', 'supabase');
    vi.stubEnv('READ_MODEL_SOURCE', 'db');

    resolveAuthenticatedViewerMock.mockResolvedValueOnce({
      userId: 'u-1',
      profileId: 'p-1',
      organizationId: 'org-1',
      role: 'management',
    });

    const mockRepo = {
      createProject: vi.fn().mockRejectedValueOnce(
        new Error('ERROR:  duplicate key value violates unique constraint "projects_pkey"'),
      ),
      getProjectById: vi.fn(),
    };
    getProjectsWriteRepositoryMock.mockReturnValueOnce(mockRepo);

    const fd = makeFormData({ name: 'X', city: 'Y' });
    const result = await createProjectAction(null, fd);

    expect(result.success).toBe(false);
    // El error no debe contener SQL ni stack
    expect(result.error).not.toMatch(/duplicate key/i);
    expect(result.error).not.toMatch(/constraint/i);
    expect(result.error).toMatch(/No se pudo crear/i);

    vi.unstubAllEnvs();
  });
});
