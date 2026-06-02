/**
 * auth-card.tsx — Tarjeta contenedora compartida para las pantallas de auth.
 * Propiedad: agent-frontend-boq. Oleada 4A.2.
 */
import { Building2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface AuthCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <Card>
      <CardHeader className="space-y-1 text-center">
        <div className="mb-3 flex justify-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-700 text-white"
            aria-hidden="true"
          >
            <Building2 className="h-6 w-6" />
          </div>
        </div>
        <CardTitle className="text-2xl">Construction Ops</CardTitle>
        <CardDescription>{description}</CardDescription>
        {title !== description && (
          <p className="text-sm font-medium text-gray-700">{title}</p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
