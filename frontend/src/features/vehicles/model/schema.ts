import { z } from 'zod';
import type { components } from '@/shared/api';
export type Vehicle = components['schemas']['VehicleResponse'];
export const vehicleSchema: z.ZodType<Vehicle> = z
  .object({
    id: z.uuid(),
    plate_number: z.string(),
    plate_normalized: z.string(),
    vehicle_type: z.string(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    color: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    status: z.enum(['ACTIVE', 'INACTIVE']),
  })
  .strict();
export const vehicleFormSchema = z.object({
  plate_number: z.string().trim().min(4, 'Nhập ít nhất 4 ký tự.').max(32),
  vehicle_type: z.string().trim().min(2, 'Nhập loại phương tiện.').max(64),
  make: z.string().max(100),
  model: z.string().max(100),
  color: z.string().max(64),
});
export type VehicleFormValues = z.infer<typeof vehicleFormSchema>;
