/**
 * auth-card.tsx — Tarjeta de acceso compartida. Refresh visual: UI/Branding ICONIC V1.
 * Propiedad: agent-frontend-boq. No altera autenticación.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { WorkspaceBrand } from '@/components/shared/workspace-brand';

interface AuthCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <Card className="border-iconic-soft-blue/70 shadow-xl">
      <CardHeader className="space-y-3 text-center">
        <div className="mb-1 flex justify-center">
          <WorkspaceBrand variant="login" />
        </div>
        <CardTitle className="sr-only">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {title !== description && (
          <p className="text-sm font-medium text-iconic-graphite">{title}</p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
