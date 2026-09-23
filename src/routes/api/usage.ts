import { createFileRoute } from '@tanstack/react-router';
import { submitUsage } from '@/lib/usage.server';
export const Route = createFileRoute('/api/usage')({server: {handlers: {POST: ({request}) => submitUsage(request)}}});
