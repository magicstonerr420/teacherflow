import { createFileRoute } from '@tanstack/react-router';
import { BetaManagementPage } from '@/components/BetaManagementPage';

export const Route = createFileRoute('/beta-management')({
  head:()=>({meta:[{title:'Management — TeacherFlow'},{name:'robots',content:'noindex, nofollow'}]}),
  component:BetaManagementPage,
});
