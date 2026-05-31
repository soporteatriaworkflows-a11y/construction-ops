/**
 * ChapterDistributionSection — distribución de costos directos por capítulo.
 * Propiedad: agent-dashboard.
 *
 * Combina gráfico de barras y tabla de top capítulos.
 * CERO cálculo financiero en React.
 */

import type { ChapterDistributionSlice, ChapterSummary } from '@/lib/contracts/read-model';
import { ChapterBarChart } from './chapter-bar-chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatCOP, formatPct } from '@/lib/utils/format';

interface ChapterDistributionSectionProps {
  chapterDistribution: ChapterDistributionSlice[];
  topChapters: ChapterSummary[];
}

export function ChapterDistributionSection({
  chapterDistribution,
  topChapters,
}: ChapterDistributionSectionProps) {
  return (
    <section aria-label="Distribución por capítulo" className="mt-6">
      <h2 className="mb-4 text-base font-semibold text-gray-900">
        Distribución de costos directos por capítulo
      </h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Gráfico de barras */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">
              Subtotal por capítulo
            </CardTitle>
            <CardDescription className="text-xs">
              Todos los capítulos en orden
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChapterBarChart data={chapterDistribution} height={320} />
          </CardContent>
        </Card>

        {/* Tabla de top capítulos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">
              Top capítulos por costo
            </CardTitle>
            <CardDescription className="text-xs">
              Los 5 capítulos con mayor impacto económico
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topChapters.length === 0 ? (
              <p className="text-sm text-gray-400" role="status">
                Sin datos
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Top capítulos por costo">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="py-2 pr-3 text-left font-medium text-gray-600 text-xs">
                        Capítulo
                      </th>
                      <th className="py-2 pr-3 text-right font-medium text-gray-600 text-xs">
                        Subtotal
                      </th>
                      <th className="py-2 text-right font-medium text-gray-600 text-xs">
                        Participación
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topChapters.map((ch, idx) => {
                      const slice = chapterDistribution.find((s) => s.chapterId === ch.id);
                      return (
                        <tr
                          key={ch.id}
                          className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                        >
                          <td className="py-2 pr-3 text-gray-800">
                            <span className="font-medium text-gray-600 mr-1">{ch.code}</span>
                            <span className="text-xs text-gray-600 leading-tight">
                              {ch.name}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums font-medium text-gray-900 whitespace-nowrap">
                            {formatCOP(ch.subtotal)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-gray-600 whitespace-nowrap">
                            {slice ? formatPct(slice.share) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla completa de todos los capítulos */}
      {chapterDistribution.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">
              Todos los capítulos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Todos los capítulos">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="py-2 pr-3 text-left font-medium text-gray-600 text-xs w-20">
                      Código
                    </th>
                    <th className="py-2 pr-3 text-left font-medium text-gray-600 text-xs">
                      Nombre
                    </th>
                    <th className="py-2 pr-3 text-right font-medium text-gray-600 text-xs">
                      Subtotal
                    </th>
                    <th className="py-2 text-right font-medium text-gray-600 text-xs w-24">
                      Participación
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {chapterDistribution.map((slice, idx) => (
                    <tr
                      key={slice.chapterId}
                      className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    >
                      <td className="py-1.5 pr-3 font-medium text-gray-600 text-xs">
                        {slice.code}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-700 text-xs">{slice.name}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-medium text-gray-900 text-xs whitespace-nowrap">
                        {formatCOP(slice.subtotal)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-gray-500 text-xs whitespace-nowrap">
                        {formatPct(slice.share)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
