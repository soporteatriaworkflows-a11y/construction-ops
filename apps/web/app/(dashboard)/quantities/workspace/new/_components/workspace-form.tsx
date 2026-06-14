'use client';

/**
 * workspace-form.tsx — Formulario de creación de grupos de cantidades.
 * Propiedad: agent-frontend-boq.
 *
 * El navegador SOLO captura inputs crudos. El resultado de cada línea lo calcula
 * el servidor (motor puro, fuente de verdad) — no se recalcula aquí.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createWorkspaceGroupAction } from '../../actions';

interface ScopeOption {
  id: string;
  name: string;
}

const FORMULA_OPTIONS: { value: string; label: string }[] = [
  { value: 'area_simple', label: 'Área simple (largo × alto)' },
  { value: 'area_floor', label: 'Área piso (largo × ancho)' },
  { value: 'wall_with_opening', label: 'Muro con vano (largo × alto − vanos)' },
  { value: 'tile_by_height', label: 'Enchape por altura (largo × altura enchape)' },
  { value: 'paint_remainder', label: 'Pintura/microcemento (resto del muro)' },
  { value: 'linear_profile', label: 'Perfil/remate lineal (longitud)' },
  { value: 'volume', label: 'Volumen (largo × ancho × espesor)' },
  { value: 'count_unit', label: 'Conteo unitario' },
  { value: 'manual_safe', label: 'Manual controlado (suma de campos)' },
];

interface LineDraft {
  description: string;
  formulaType: string;
  resultUnit: string;
  length: string;
  width: string;
  height: string;
  thickness: string;
  count: string;
  partialHeight: string;
  openingDeduction: string;
  wastePct: string;
}

function emptyLine(formulaType = 'area_simple', resultUnit = 'm²'): LineDraft {
  return {
    description: '',
    formulaType,
    resultUnit,
    length: '',
    width: '',
    height: '',
    thickness: '',
    count: '',
    partialHeight: '',
    openingDeduction: '',
    wastePct: '',
  };
}

export function WorkspaceForm({ scopes }: { scopes: ScopeOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [projectScopeId, setProjectScopeId] = useState(scopes[0]?.id ?? '');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [floor, setFloor] = useState('');
  const [moduleField, setModuleField] = useState('');
  const [space, setSpace] = useState('');
  const [element, setElement] = useState('');
  const [resultUnit, setResultUnit] = useState('m²');
  const [templateKind, setTemplateKind] = useState<'generic' | 'mixed_wall'>('generic');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  /** Plantilla muro mixto (§3): pre-llena 4 líneas derivadas para editar. */
  function applyMixedWall() {
    setTemplateKind('mixed_wall');
    setLines([
      { ...emptyLine('wall_with_opening', 'm²'), description: 'Muro board / sustrato' },
      { ...emptyLine('tile_by_height', 'm²'), description: 'Enchape (por altura)' },
      { ...emptyLine('linear_profile', 'ml'), description: 'Perfil / remate del enchape' },
      { ...emptyLine('paint_remainder', 'm²'), description: 'Pintura / microcemento (resto)' },
    ]);
  }

  function submit() {
    setError(null);
    const payload = {
      projectScopeId,
      code,
      name,
      floor,
      module: moduleField,
      space,
      element,
      resultUnit,
      templateKind,
      lines,
    };
    const fd = new FormData();
    fd.set('payload', JSON.stringify(payload));
    startTransition(async () => {
      const res = await createWorkspaceGroupAction(fd);
      if (res.ok) {
        router.push('/quantities/workspace');
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del grupo</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="scope">Alcance / piso</Label>
            <Select id="scope" value={projectScopeId} onChange={(e) => setProjectScopeId(e.target.value)}>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="code">Código</Label>
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="HAB-P1-01" />
          </div>
          <div>
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Muro habitaciones piso 1" />
          </div>
          <div>
            <Label htmlFor="floor">Piso</Label>
            <Input id="floor" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="Primer piso" />
          </div>
          <div>
            <Label htmlFor="module">Módulo</Label>
            <Input id="module" value={moduleField} onChange={(e) => setModuleField(e.target.value)} placeholder="Habitaciones" />
          </div>
          <div>
            <Label htmlFor="space">Espacio</Label>
            <Input id="space" value={space} onChange={(e) => setSpace(e.target.value)} placeholder="Habitación 1" />
          </div>
          <div>
            <Label htmlFor="element">Elemento</Label>
            <Input id="element" value={element} onChange={(e) => setElement(e.target.value)} placeholder="Muro norte" />
          </div>
          <div>
            <Label htmlFor="unit">Unidad de resultado</Label>
            <Input id="unit" value={resultUnit} onChange={(e) => setResultUnit(e.target.value)} placeholder="m²" />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addLine}>+ Línea</Button>
        <Button type="button" variant="outline" size="sm" onClick={applyMixedWall}>
          Plantilla muro mixto (board + enchape + perfil + pintura)
        </Button>
        <span className="text-xs text-gray-500">
          El resultado de cada línea lo calcula el servidor.
        </span>
      </div>

      <div className="space-y-3">
        {lines.map((line, idx) => (
          <Card key={idx}>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="col-span-2 sm:col-span-3 lg:col-span-2">
                  <Label>Descripción</Label>
                  <Input value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                </div>
                <div className="col-span-2 lg:col-span-2">
                  <Label>Tipo de cálculo</Label>
                  <Select value={line.formulaType} onChange={(e) => updateLine(idx, { formulaType: e.target.value })}>
                    {FORMULA_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Unidad</Label>
                  <Input value={line.resultUnit} onChange={(e) => updateLine(idx, { resultUnit: e.target.value })} />
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(idx)} disabled={lines.length === 1}>
                    Quitar
                  </Button>
                </div>
                <NumField label="Largo" value={line.length} onChange={(v) => updateLine(idx, { length: v })} />
                <NumField label="Ancho" value={line.width} onChange={(v) => updateLine(idx, { width: v })} />
                <NumField label="Alto" value={line.height} onChange={(v) => updateLine(idx, { height: v })} />
                <NumField label="Espesor" value={line.thickness} onChange={(v) => updateLine(idx, { thickness: v })} />
                <NumField label="Altura enchape" value={line.partialHeight} onChange={(v) => updateLine(idx, { partialHeight: v })} />
                <NumField label="Cantidad" value={line.count} onChange={(v) => updateLine(idx, { count: v })} />
                <NumField label="Descuento vanos" value={line.openingDeduction} onChange={(v) => updateLine(idx, { openingDeduction: v })} />
                <NumField label="Desperdicio (0–1)" value={line.wastePct} onChange={(v) => updateLine(idx, { wastePct: v })} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? 'Guardando…' : 'Crear grupo de cantidades'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/quantities/workspace')}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" />
    </div>
  );
}
