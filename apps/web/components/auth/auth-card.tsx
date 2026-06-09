/**
 * auth-card.tsx — Tarjeta contenedora compartida para las pantallas de auth.
 * Propiedad: agent-frontend-boq. Refresh visual: UI/Branding V1.
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
    <Card className="border-iconic-soft/70 shadow-xl">
      <CardHeader className="space-y-3 text-center">
        <div className="mb-1 flex justify-center">
          <WorkspaceBrand variant="login" />
        </div>
        <CardTitle className="sr-only">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {title !== description && (
          <p className="text-sm font-medium text-gray-700">{title}</p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
