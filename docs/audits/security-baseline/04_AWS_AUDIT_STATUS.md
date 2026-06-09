# 04 — Estado de Auditoría AWS

## Conclusión

```
AWS_AUDIT_STATUS = NOT_APPLICABLE
```

El proyecto **no utiliza AWS**. La auditoría AWS no aplica a la arquitectura real.

## Evidencia

| Indicador buscado | Resultado |
|---|---|
| Imports `@aws-sdk` / `aws-sdk` / `require('aws...')` en código | **0** coincidencias (`apps/**`, `scripts/**`, `supabase/**`) |
| Variables `AWS_*` (env, código, `.env.example`) | **0** |
| `.amazonaws.com`, claves `AKIA[0-9A-Z]{16}` | **0** |
| `@aws-sdk` instalado en `node_modules` | **No instalado** |
| Servicios IAM/S3/Lambda/ECS/EC2/RDS/Route53/Cognito/SES/SQS/SNS/CloudTrail/GuardDuty/WAF | Sin evidencia en código/migraciones/config |
| IaC (Terraform/CloudFormation) | Ausente |

**Únicas menciones** a AWS: en `pnpm-lock.yaml`, como **peer dependencies
opcionales** de Drizzle (`@aws-sdk/client-rds-data`, `@cloudflare/workers-types`),
que Drizzle declara para sus drivers alternativos. **No** están instaladas ni se
importan; el driver real es `postgres` (postgres.js) sobre `DATABASE_URL`.

## Implicación

No procede revisar IAM, S3 Public Access Block, CloudTrail, GuardDuty, WAF AWS,
Security Groups ni cifrado de servicios AWS. Si en el futuro se incorpora AWS (p.
ej. S3 para almacenamiento de exports), deberá abrirse una auditoría AWS dedicada
(IAM mínimo privilegio, S3 Public Access Block, cifrado, CloudTrail, alertas,
backups, secret management).

## Checklist manual (solo si se adoptara AWS en el futuro)

- [ ] IAM: roles por servicio, sin claves estáticas de larga duración, MFA admin.
- [ ] S3: Public Access Block ON, cifrado SSE, sin objetos públicos.
- [ ] CloudTrail multi-región + alertas; GuardDuty.
- [ ] WAF solo sobre superficie pública concreta.
- [ ] Backups + prueba de restauración; Secrets Manager para credenciales.
