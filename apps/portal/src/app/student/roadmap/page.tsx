'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface Course {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  lessonCount?: number;
  progress?: number;
  status?: 'locked' | 'available' | 'in_progress' | 'completed';
  order?: number;
}

interface Package {
  id: string;
  name: string;
  description?: string;
  courses: Course[];
}

interface Cohort {
  id: string;
  name: string;
  package?: Package;
}

const COURSE_COLORS = [
  // One accent: flat shades of the brand blue
  'from-azure to-azure',
  'from-royal to-royal',
  'from-azure-strong to-azure-strong',
  'from-azure to-azure',
  'from-royal to-royal',
  'from-azure-strong to-azure-strong',
];

function StatusBadge({ status }: { status: Course['status'] }) {
  const map = {
    completed:   { bg: 'bg-emerald-100 text-emerald-600', label: 'Done' },
    in_progress: { bg: 'bg-azure/10 text-azure',          label: 'In Progress' },
    available:   { bg: 'bg-amber-100 text-amber-600',     label: 'Start' },
    locked:      { bg: 'bg-cloud text-royal/40',          label: 'Locked' },
  };
  const s = map[status ?? 'locked'];
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${s.bg}`}>{s.label}</span>
  );
}

function CourseNode({ course, index, isLast }: { course: Course; index: number; isLast: boolean }) {
  const isLeft = index % 2 === 0;
  const color  = COURSE_COLORS[index % COURSE_COLORS.length];
  const done   = course.status === 'completed';
  const locked = course.status === 'locked';

  return (
    <div className="relative flex items-center gap-0">
      {/* Left card */}
      <div className={`flex-1 ${isLeft ? 'pr-8' : 'pl-8 invisible'}`}>
        {isLeft && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.07 }}
          >
            <CourseCard course={course} color={color} />
          </motion.div>
        )}
      </div>

      {/* Centre spine + node */}
      <div className="flex flex-col items-center z-10">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ring-4 ring-white
          ${done ? 'bg-emerald-400' : locked ? 'bg-cloud' : `bg-gradient-to-br ${color}`}`}>
          {done
            ? <Icon name="certificates" size={16} className="text-white" />
            : locked
              ? <Icon name="shield" size={14} className="text-royal/30" />
              : <span className="text-xs font-bold text-white">{index + 1}</span>
          }
        </div>
        {!isLast && <div className="w-0.5 h-16 bg-cloud mt-1" />}
      </div>

      {/* Right card */}
      <div className={`flex-1 ${!isLeft ? 'pl-8' : 'pr-8 invisible'}`}>
        {!isLeft && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.07 }}
          >
            <CourseCard course={course} color={color} />
          </motion.div>
        )}
      </div>
    </div>
  );
}

function CourseCard({ course, color }: { course: Course; color: string }) {
  const locked = course.status === 'locked';
  const href   = locked ? '#' : `/student/learn/${course.id}`;

  return (
    <Link href={href} className={locked ? 'pointer-events-none' : ''}>
      <div className={`rounded-2xl border border-cloud bg-white p-4 hover:shadow-md transition-shadow
        ${locked ? 'opacity-50' : 'hover:border-azure/30'}`}>
        {/* Thumbnail strip */}
        <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${color} mb-3 opacity-60`} />
        <p className="text-xs font-bold text-navy leading-snug">{course.title}</p>
        {course.description && (
          <p className="text-[10px] text-royal/50 mt-1 leading-relaxed line-clamp-2">{course.description}</p>
        )}
        <div className="flex items-center justify-between mt-3">
          {course.lessonCount !== undefined && (
            <span className="text-[10px] text-royal/40">{course.lessonCount} lessons</span>
          )}
          <StatusBadge status={course.status} />
        </div>
        {course.progress !== undefined && course.progress > 0 && (
          <div className="mt-2 h-1 w-full rounded-full bg-cloud overflow-hidden">
            <div className="h-full rounded-full bg-azure" style={{ width: `${course.progress}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}

export default function RoadmapPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/portals/student/cohorts')
      .then(r => {
        const data: Cohort[] = r.data ?? [];
        setCohorts(data);
        if (data.length > 0) setSelected(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cohort   = cohorts.find(c => c.id === selected);
  const courses  = (cohort?.package?.courses ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const done     = courses.filter(c => c.status === 'completed').length;
  const pct      = courses.length ? Math.round((done / courses.length) * 100) : 0;

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <div className="h-14 bg-cloud animate-pulse" />
      <div className="p-6 space-y-4">
        {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="Learning Roadmap"
        subtitle="Your course sequence within each programme"
        backHref="/student/dashboard"
        backLabel="Dashboard"
      />

      <div className="flex-1 p-4 md:p-6 max-w-3xl">

        {cohorts.length === 0 ? (
          <Card padding="md" className="flex flex-col items-center py-16 text-center">
            <Icon name="notebook" size={36} className="text-cloud mb-3" />
            <p className="text-sm font-bold text-navy">No cohorts yet</p>
            <p className="text-xs text-royal/40 mt-1">Join a programme to see your roadmap</p>
            <Link href="/packages" className="mt-4 rounded-xl bg-azure px-4 py-2 text-xs font-bold text-white">
              Browse packages
            </Link>
          </Card>
        ) : (
          <>
            {/* Package selector tabs */}
            {cohorts.length > 1 && (
              <div className="flex gap-2 flex-wrap mb-5">
                {cohorts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition
                      ${selected === c.id ? 'bg-azure text-white' : 'bg-cloud text-navy hover:bg-azure/10'}`}>
                    {c.package?.name ?? c.name}
                  </button>
                ))}
              </div>
            )}

            {/* Progress bar */}
            {cohort && (
              <Card padding="md" className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-navy">{cohort.package?.name ?? cohort.name}</p>
                    {cohort.package?.description && (
                      <p className="text-xs text-royal/50 mt-0.5">{cohort.package.description}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-azure">{pct}%</p>
                    <p className="text-[10px] text-royal/40">{done}/{courses.length} done</p>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-cloud overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-azure-strong"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
              </Card>
            )}

            {/* Zigzag timeline */}
            {courses.length === 0 ? (
              <Card padding="md" className="flex flex-col items-center py-12 text-center">
                <Icon name="notebook" size={28} className="text-cloud mb-2" />
                <p className="text-xs font-semibold text-navy">No courses in this programme yet</p>
              </Card>
            ) : (
              <div className="relative">
                {courses.map((course, i) => (
                  <CourseNode key={course.id} course={course} index={i} isLast={i === courses.length - 1} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
