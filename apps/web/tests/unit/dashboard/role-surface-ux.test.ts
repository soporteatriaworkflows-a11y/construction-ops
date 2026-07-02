import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dashboardPage = readFileSync(join(root, 'app/(dashboard)/dashboard/page.tsx'), 'utf8');
const guard = readFileSync(join(root, 'server/access/guard.ts'), 'utf8');
const layout = readFileSync(join(root, 'app/(dashboard)/layout.tsx'), 'utf8');
const rail = readFileSync(join(root, 'components/shared/app-rail.tsx'), 'utf8');
const dock = readFileSync(join(root, 'components/shared/floating-workflow-dock.tsx'), 'utf8');

describe('dashboard role surface UX wiring', () => {
  it('requireModuleAccess redirects with denied module query', () => {
    expect(guard).toContain("'/dashboard?denied=' + encodeURIComponent(module)");
  });

  it('dashboard shows neutral dismissed callout for denied query', () => {
    expect(dashboardPage).toContain('isAccessModule(deniedParam)');
    expect(dashboardPage).toContain('<DeniedModuleCallout module={deniedModule} />');
  });

  it('dashboard filters command center buttons and workflow by canAccessModule', () => {
    expect(dashboardPage).toContain("canOpenModule('planning')");
    expect(dashboardPage).toContain("canOpenModule('catalog')");
    expect(dashboardPage).toContain('workflowSteps.length > 0');
    expect(dashboardPage).toContain('<WorkflowStrip steps={workflowSteps.map');
  });

  it('dashboard filters price alerts by module and hides empty alert section', () => {
    expect(dashboardPage).toContain("canOpenModule('operational-review')");
    expect(dashboardPage).toContain("canOpenModule('monitoring')");
    expect(dashboardPage).toContain('alertCards.length > 0');
    expect(dashboardPage).toContain('alertCards.map');
  });

  it('assistant surfaces are gated by canUseQuoteAssistant', () => {
    expect(layout).toContain('quoteAssistantAvailable && <QuoteCompanion />');
    expect(layout).toContain('quoteAssistantAvailable={quoteAssistantAvailable}');
    expect(rail).toContain('quoteAssistantAvailable &&');
    expect(dock).toContain('canUseQuoteAssistant(profileRole)');
  });
});
