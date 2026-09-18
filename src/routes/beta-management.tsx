import { createFileRoute } from '@tanstack/react-router';
import { BetaManagementPage } from '@/components/BetaManagementPage';

export const Route = createFileRoute('/beta-management')({
  head:()=>({meta:[{title:'Beta management — TeacherFlow'},{name:'robots',content:'noindex, nofollow'}]}),
  component:BetaManagementPage,
});
