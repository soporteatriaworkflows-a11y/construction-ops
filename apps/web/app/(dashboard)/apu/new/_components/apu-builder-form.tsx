/**
 * apu-builder-form.tsx — Constructor manual de APU (cliente).
 *
 * 'use client'. Gestiona filas de materiales y mano de obra y un RESUMEN
 * ESTIMADO en vivo (display) usando los precios provistos server-side. El
 * cálculo AUTORITATIVO ocurre server-side en la RPC; el navegador nunca dicta
 * precios ni subtotales. Al enviar, serializa la entrada en un payload JSON.
 */
'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatCOP } from '@/lib/utils/format';
import type { ApuBuilderData, CopyFromApuData, ManualApuInput } from '@/lib/apu-builder/types';
import { createManualApuAction, type CreateManualApuActionResult } from '../actions';

interface MaterialRow {
  resourceId: string;
  quantity: string;
  wastePct: string; // porcentaje (0-100) en la UI
  notes: string;
}
interface LaborRow {
  laborRoleId: string;
  performanceDays: string;
  memberCount: string;
  notes: string;
}

const INITIAL: CreateManualApuActionResult | null = null;

function num(v: string): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function ApuBuilderForm({
  data,
  preselectedResourceId,
  copyFromData,
}: {
  data: ApuBuilderData;
  preselectedResourceId: string | null;
  copyFromData?: CopyFromApuData | null;
}) {
  const [state, formAction, isPending] = useActionState(createManualApuAction, INITIAL);

  const firstResource =
    preselectedResourceId && data.materials.some((m) => m.id === preselectedResourceId)
      ? preselectedResourceId
      : data.materials[0]?.id ?? '';

  // Inicializa desde copyFromData si se está duplicando, o desde cero.
  const [code, setCode] = useState(
    copyFromData ? copyFromData.header.code + '-COPIA' : '',
  );
  const [name, setName] = useState(copyFromData ? copyFromData.header.name : '');
  const [unit, setUnit] = useState(copyFromData ? copyFromData.header.unit : '');
  // toolPct: fracción [0,1] → porcentaje para la UI
  const [toolPct, setToolPct] = useState(
    copyFromData
      ? String(Number(copyFromData.header.defaultToolPct) * 100)
      : '0',
  );
  const [description, setDescription] = useState(
    copyFromData ? (copyFromData.header.description ?? '') : '',
  );
  const [materials, setMaterials] = useState<MaterialRow[]>(
    copyFromData
      ? copyFromData.materials.map((m) => ({
          resourceId: m.resourceId,
          quantity: m.quantity,
          wastePct: String(Number(m.wastePct) * 100),
          notes: m.notes ?? '',
        }))
      : preselectedResourceId
        ? [{ resourceId: firstResource, quantity: '1', wastePct: '0', notes: '' }]
        : [],
  );
  const [labor, setLabor] = useState<LaborRow[]>(
    copyFromData
      ? copyFromData.labor.map((l) => ({
          laborRoleId: l.laborRoleId,
          performanceDays: l.performanceDays,
          memberCount: l.memberCount,
          notes: l.notes ?? '',
        }))
      : [],
  );

  const materialById = useMemo(
    () => new Map(data.materials.map((m) => [m.id, m])),
    [data.materials],
  );
  const roleById = useMemo(
    () => new Map(data.laborRoles.map((r) => [r.id, r])),
    [data.laborRoles],
  );

  // Resumen ESTIMADO (display only).
  const preview = useMemo(() => {
    let materialsCost = 0;
    let missingPrice = false;
    for (const m of materials) {
      const res = materialById.get(m.resourceId);
      if (!res) continue;
      if (res.approvedPrice === null) {
        missingPrice = true;
        continue;
      }
      materialsCost += num(m.quantity) * (1 + num(m.wastePct) / 100) * num(res.approvedPrice);
    }
    let laborCost = 0;
    for (const l of labor) {
      const role = roleById.get(l.laborRoleId);
      if (!role) continue;
      laborCost += num(l.performanceDays) * num(l.memberCount) * num(role.dailyIntegralCost);
    }
    const toolDerived = (num(toolPct) / 100) * laborCost;
    return {
      materialsCost,
      laborCost,
      toolDerived,
      total: materialsCost + laborCost + toolDerived,
      missingPrice,
    };
  }, [materials, labor, toolPct, materialById, roleById]);

  const payload: ManualApuInput = {
    header: {
      code,
      name,
      unit,
      defaultToolPct: String(num(toolPct) / 100),
      description: description || undefined,
    },
    materials: materials.map((m) => ({
      resourceId: m.resourceId,
      quantity: m.quantity,
      wastePct: String(num(m.wastePct) / 100),
      notes: m.notes || undefined,
    })),
    labor: labor.map((l) => ({
      laborRoleId: l.laborRoleId,
      performanceDays: l.performanceDays,
      memberCount: l.memberCount,
      notes: l.notes || undefined,
    })),
  };

  const hasComponents = materials.length > 0 || labor.length > 0;
  const allMaterialsValid = materials.every((m) => {
    const q = Number.parseFloat(m.quantity);
    return Number.isFinite(q) && q > 0;
  });
  const allLaborValid = labor.every((l) => {
    const d = Number.parseFloat(l.performanceDays);
    const c = Number.parseFloat(l.memberCount);
    return Number.isFinite(d) && d > 0 && Number.isFinite(c) && c > 0;
  });
  const canSubmit =
    !isPending &&
    code.trim() !== '' &&
    name.trim() !== '' &&
    unit.trim() !== '' &&
    hasComponents &&
    allMaterialsValid &&
    allLaborValid &&
    !preview.missingPrice;

  const submitLabel = copyFromData ? 'Crear APU (copia corregida)' : 'Crear APU';

  return (
    <form action={formAction} noValidate aria-label="Constructor de APU">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      {copyFromData && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <strong>Duplicando para corregir:</strong> valores precargados de «{copyFromData.originName}».
          {copyFromData.isArchived && ' (APU origen archivado)'}
          {' '}Revisa y ajusta antes de guardar.
          Los precios se recalcularán server-side.
          {copyFromData.labor.length > 0 && ' Para M.O., el rendimiento se precargó como días totales con 1 integrante — ajusta si es necesario.'}
        </div>
      )}

      {state?.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {state.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* 1. Información de la actividad */}
          <fieldset className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
            <legend className="px-1 text-sm font-semibold text-gray-700">1. Actividad</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="code">Código *</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="APU-001" disabled={isPending} maxLength={40} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit">Unidad *</Label>
                <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="m², ml, und…" disabled={isPending} maxLength={20} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Descripción de la actividad *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Suministro e instalación de…" disabled={isPending} maxLength={200} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="toolPct">Herramienta menor (% sobre M.O.)</Label>
                <Input id="toolPct" type="number" min="0" max="100" step="0.1" value={toolPct} onChange={(e) => setToolPct(e.target.value)} disabled={isPending} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Notas (opcional)</Label>
                <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={isPending} maxLength={300} />
              </div>
            </div>
          </fieldset>

          {/* 2. Materiales */}
          <fieldset className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
            <legend className="px-1 text-sm font-semibold text-gray-700">2. Materiales</legend>
            {data.materials.length === 0 && (
              <p className="text-sm text-gray-400">No hay recursos en el catálogo.</p>
            )}
            {materials.map((m, i) => {
              const res = materialById.get(m.resourceId);
              const noPrice = res && res.approvedPrice === null;
              return (
                <div key={i} className="rounded-md border border-gray-100 bg-gray-50/60 p-3">
                  <div className="grid items-end gap-2 sm:grid-cols-[1fr_5rem_5rem_auto]">
                    <div className="space-y-1">
                      <Label htmlFor={`mat-${i}`} className="text-xs">Recurso</Label>
                      <Select
                        id={`mat-${i}`}
                        value={m.resourceId}
                        disabled={isPending}
                        onChange={(e) => updateRow(setMaterials, i, { resourceId: e.target.value })}
                      >
                        {data.materials.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.code} · {opt.name} {opt.approvedPrice ? `(${formatCOP(opt.approvedPrice)})` : '(sin precio)'}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`matq-${i}`} className="text-xs">Cantidad</Label>
                      <Input id={`matq-${i}`} type="number" min="0" step="any" value={m.quantity} disabled={isPending} onChange={(e) => updateRow(setMaterials, i, { quantity: e.target.value })} />
                      <p className="text-xs text-gray-400">Debe ser mayor que cero.</p>
                      {!noPrice && num(m.quantity) <= 0 && (
                        <p className="mt-0.5 text-xs text-red-600">
                          La cantidad debe ser mayor que cero.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`matw-${i}`} className="text-xs">Desp. %</Label>
                      <Input id={`matw-${i}`} type="number" min="0" step="any" value={m.wastePct} disabled={isPending} onChange={(e) => updateRow(setMaterials, i, { wastePct: e.target.value })} />
                    </div>
                    <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => removeRow(setMaterials, i)} aria-label="Quitar material">
                      <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
                    </Button>
                  </div>
                  {noPrice && (
                    <p className="mt-1 text-xs text-amber-700">
                      Este recurso no tiene precio aprobado vigente; aprueba un precio antes de usarlo.
                    </p>
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || data.materials.length === 0}
              onClick={() =>
                setMaterials((rows) => [
                  ...rows,
                  { resourceId: data.materials[0]?.id ?? '', quantity: '1', wastePct: '0', notes: '' },
                ])
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Agregar material
            </Button>
          </fieldset>

          {/* 3. Mano de obra */}
          <fieldset className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
            <legend className="px-1 text-sm font-semibold text-gray-700">3. Mano de obra</legend>
            {data.laborRoles.length === 0 && (
              <p className="text-sm text-gray-400">No hay roles de mano de obra configurados.</p>
            )}
            {labor.map((l, i) => (
              <div key={i} className="grid items-end gap-2 rounded-md border border-gray-100 bg-gray-50/60 p-3 sm:grid-cols-[1fr_5rem_5rem_auto]">
                <div className="space-y-1">
                  <Label htmlFor={`lab-${i}`} className="text-xs">Rol</Label>
                  <Select
                    id={`lab-${i}`}
                    value={l.laborRoleId}
                    disabled={isPending}
                    onChange={(e) => updateRow(setLabor, i, { laborRoleId: e.target.value })}
                  >
                    {data.laborRoles.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.code} · {opt.name} ({formatCOP(opt.dailyIntegralCost)}/día)
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`labd-${i}`} className="text-xs">Rend. (días)</Label>
                  <Input id={`labd-${i}`} type="number" min="0" step="any" value={l.performanceDays} disabled={isPending} onChange={(e) => updateRow(setLabor, i, { performanceDays: e.target.value })} />
                  <p className="text-xs text-gray-400">Debe ser mayor que cero.</p>
                  {num(l.performanceDays) <= 0 && (
                    <p className="mt-0.5 text-xs text-red-600">
                      El rendimiento debe ser mayor que cero.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`labc-${i}`} className="text-xs">Integrantes</Label>
                  <Input id={`labc-${i}`} type="number" min="0" step="any" value={l.memberCount} disabled={isPending} onChange={(e) => updateRow(setLabor, i, { memberCount: e.target.value })} />
                  <p className="text-xs text-gray-400">Debe ser mayor que cero.</p>
                  {num(l.memberCount) <= 0 && (
                    <p className="mt-0.5 text-xs text-red-600">
                      El numero de integrantes debe ser mayor que cero.
                    </p>
                  )}
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => removeRow(setLabor, i)} aria-label="Quitar rol">
                  <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || data.laborRoles.length === 0}
              onClick={() =>
                setLabor((rows) => [
                  ...rows,
                  { laborRoleId: data.laborRoles[0]?.id ?? '', performanceDays: '', memberCount: '1', notes: '' },
                ])
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Agregar mano de obra
            </Button>
          </fieldset>
        </div>

        {/* 4-5. Resumen calculado (estimado en vivo) + confirmación */}
        <aside className="space-y-3">
          <div className="sticky top-4 space-y-3 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-700">Resumen estimado</h2>
            <SummaryRow label="Materiales" value={preview.materialsCost} />
            <SummaryRow label="Mano de obra" value={preview.laborCost} />
            <SummaryRow label="Herramienta menor" value={preview.toolDerived} />
            <div className="flex items-center justify-between border-t border-gray-100 pt-2">
              <span className="text-sm font-semibold text-gray-800">Costo unitario</span>
              <span className="text-lg font-bold tabular-nums text-blue-700">
                {formatCOP(String(preview.total))}
              </span>
            </div>
            {preview.missingPrice && (
              <p className="text-xs text-amber-700">
                Hay materiales sin precio aprobado; el guardado los rechazará.
              </p>
            )}
            <p className="text-xs text-gray-400">
              Estimado en pantalla. El costo definitivo se calcula server-side al guardar.
            </p>
            <Button type="submit" className="w-full" disabled={!canSubmit} aria-busy={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isPending ? 'Guardando…' : 'Crear APU'}
            </Button>
            <Button asChild type="button" variant="outline" className="w-full" disabled={isPending}>
              <Link href="/apu">Cancelar</Link>
            </Button>
          </div>
        </aside>
      </div>
    </form>
  );
}

function updateRow<T>(
  setRows: React.Dispatch<React.SetStateAction<T[]>>,
  index: number,
  patch: Partial<T>,
): void {
  setRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
}

function removeRow<T>(setRows: React.Dispatch<React.SetStateAction<T[]>>, index: number): void {
  setRows((rows) => rows.filter((_, i) => i !== index));
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="tabular-nums text-gray-800">{formatCOP(String(value))}</span>
    </div>
  );
}
