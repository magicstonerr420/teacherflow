import { createFileRoute } from '@tanstack/react-router';
import { MyProfilePage } from '@/components/MyProfilePage';
export const Route=createFileRoute('/profile')({
  head:()=>({meta:[{title:'My profile — TeacherFlow'},{name:'robots',content:'noindex, nofollow'}]}),
  component:MyProfilePage,
});
