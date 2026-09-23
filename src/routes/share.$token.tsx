import { createFileRoute } from "@tanstack/react-router";

import { StudentLessonView } from "@/components/StudentLessonView";
import { getPublicStudentShare } from "@/lib/student-share.functions";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "Student materials — TeacherFlow" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
      { name: "description", content: "Student materials shared by your teacher." },
    ],
  }),
  headers: () => ({
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  }),
  loader: async ({ params }) => {
    try {
      return await getPublicStudentShare({ data: { token: params.token } });
    } catch {
      return null;
    }
  },
  component: SharedLessonPage,
  errorComponent: () => <StudentLessonView share={null} />,
});

function SharedLessonPage() {
  return <StudentLessonView key={Route.useParams().token} share={Route.useLoaderData()} />;
}
