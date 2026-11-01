/** Shapes returned by the school portal API */
export interface SchoolPackage {
  enrollmentId: string; name: string; courses: number; liveClasses: boolean; mentorship: boolean; validityDays: number | null;
  seats: number; invited: number; joined: number; free: number;
}
export interface SchoolDashboard {
  org: { id: string; name: string; joinCode: string; joinEnabled: boolean; emailDomain: string | null };
  packages: SchoolPackage[];
  stats: { seats: number; used: number; joined: number; activeWeek: number; lessonsDone: number; avgQuiz: number | null; avgQuizMonth: number | null };
  nudges: { invitedNotJoined: number; joinedNotStarted: number; quietTwoWeeks: number };
}
export interface SchoolStudent {
  seatId: string; enrollmentId: string; packageName: string; status: 'joined' | 'invited'; joinedVia: 'EMAIL' | 'LINK';
  studentId: string | null; name: string | null; email: string | null; invitedAt: string; joinedAt: string | null; remindedAt: string | null;
  lessons: { done: number; total: number }; avgQuiz: number | null; lastActive: string | null;
}
export const joinLink = (code: string) => `${typeof window !== 'undefined' ? window.location.origin : 'https://portal.careerpathafrica.com'}/join/school/${code}`;
