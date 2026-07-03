import { canAccessModule, type AccessModule } from '@/server/access/module-access';

export function canAccessAllModules(
  role: string | null | undefined,
  modules: readonly AccessModule[],
): boolean {
  return modules.every((module) => canAccessModule(role, module));
}

export function canUseQuoteAssistant(role: string | null | undefined): boolean {
  return role !== 'consulta' && canAccessAllModules(role, ['estimates', 'apu']);
}

export function canUseWriteSurface(role: string | null | undefined): boolean {
  return role !== 'consulta';
}
