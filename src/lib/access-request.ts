import { z } from 'zod';

export const accessRequestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  teaching: z.string().trim().min(5).max(800),
  consent: z.literal(true),
  website: z.string().max(200).default(''),
});
export type AccessRequestInput = z.infer<typeof accessRequestSchema>;
export const requestStatuses = ['pending', 'approved', 'declined'] as const;
export type RequestStatus = typeof requestStatuses[number];
export type AccessRequestRow = { id: string; name: string; email: string; teaching: string; status: RequestStatus; created: number; reviewed: number | null; revision: string; emailStatus?: string | null; emailError?: string | null };
