/**
 * project-grants-cell.tsx — Proyectos asignados a un usuario `consulta`
 * (V5.6.4 CLIENT_PROJECT_SCOPE). Client Component.
 *
 * Muestra el conteo de proyectos asignados y un panel expandible con un
 * toggle Asignar/Retirar por proyecto. El backstop real son las RPCs
 * SECURITY DEFINER (`grant/revoke_project_access`): esta UI solo refleja el
 * estado; jamás decide permisos por su cuenta.
 */
'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  grantProjectAccessAction,
  revokeProjectAccessAction,
  type AccessActionResult,
} from '../actions';

export interface GrantableProject {
  id: string;
  name: string;
}

const INITIAL: AccessActionResult | null = null;

function ProjectToggleRow({
  userId,
  project,
  granted,
}: {
  userId: string;
  project: GrantableProject;
  granted: boolean;
}) {
  const action = granted ? revokeProjectAccessAction : grantProjectAccessAction;
  const [state, formAction, isPending] = useActionState(action, INITIAL);

  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate text-sm text-iconic-ink">{project.name}</span>
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="projectId" value={project.id} />
        {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
        <Button
          type="submit"
          variant={granted ? 'outline' : 'default'}
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={isPending}
          aria-label={`${granted ? 'Retirar' : 'Asignar'} ${project.name}`}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : granted ? (
            <>
              <Minus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Retirar
            </>
          ) : (
            <>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Asignar
            </>
          )}
        </Button>
      </form>
    </li>
  );
}

export function ProjectGrantsCell({
  userId,
  projects,
  grantedProjectIds,
  canManage,
}: {
  userId: string;
  projects: GrantableProject[];
  grantedProjectIds: string[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const grantedSet = new Set(grantedProjectIds);
  const count = grantedSet.size;

  const label =
    count === 0 ? 'Sin proyectos' : count === 1 ? '1 proyecto' : `${count} proyectos`;

  return (
    <div className="min-w-56">
      <div className="flex items-center gap-2">
        <span
          className={
            count === 0
              ? 'inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'
              : 'inline-flex rounded-full bg-iconic-gray px-2 py-0.5 text-xs font-medium text-iconic-graphite'
          }
        >
          {label}
        </span>
        {canManage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`Gestionar proyectos asignados (${label})`}
          >
            Gestionar
            {open ? (
              <ChevronUp className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
        )}
      </div>
      {count === 0 && (
        <p className="mt-1 text-xs text-amber-700/90">
          Este usuario no verá ningún proyecto hasta que le asignes uno.
        </p>
      )}
      {open && canManage && (
        <div className="mt-2 rounded-lg border border-iconic-soft-blue/50 bg-white p-3">
          {projects.length === 0 ? (
            <p className="text-xs text-iconic-graphite/60">
              No hay proyectos activos en la organización.
            </p>
          ) : (
            <ul className="divide-y divide-iconic-soft-blue/30">
              {projects.map((p) => (
                <ProjectToggleRow
                  key={p.id}
                  userId={userId}
                  project={p}
                  granted={grantedSet.has(p.id)}
                />
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] leading-snug text-iconic-graphite/60">
            Los proyectos nuevos no se asignan automáticamente. Cada cambio queda
            registrado en la bitácora de accesos.
          </p>
        </div>
      )}
    </div>
  );
}
