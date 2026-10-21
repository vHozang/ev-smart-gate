import { z } from 'zod';

export const auditOutcomeSchema = z.enum(['SUCCEEDED', 'DENIED', 'FAILED']);
export type AuditOutcome = z.infer<typeof auditOutcomeSchema>;

export const auditViewSchema = z
  .object({
    id: z.string().uuid(),
    actor_id: z.string().uuid().nullable(),
    action: z.string().min(1).max(128),
    target_type: z.string().min(1).max(128),
    target_id: z.string(),
    occurred_at: z.string().datetime(),
    request_id: z.string(),
    outcome: auditOutcomeSchema,
    redacted_changes: z.record(z.string(), z.unknown()),
  })
  .strict();

export type AuditView = z.infer<typeof auditViewSchema>;

export interface ListAuditParams {
  cursor?: string;
  limit?: number;
  actor_id?: string;
  target_type?: string;
  action?: string;
  outcome?: AuditOutcome;
  from?: string;
  to?: string;
}
