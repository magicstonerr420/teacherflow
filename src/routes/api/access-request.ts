import { createFileRoute } from '@tanstack/react-router';
import { submitAccessRequest } from '@/lib/access-request.server';

export const Route = createFileRoute('/api/access-request')({server: {handlers: {POST: ({request}) => submitAccessRequest(request)}}});
