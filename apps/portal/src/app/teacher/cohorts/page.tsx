'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { spring } from '@/lib/motion';
import api from '@/lib/api';
import { TeacherCohortsHero } from '@/components/hero/TeacherHeroes';

interface Cohort {
  id: string; name: string;
  package?: { name: string } | null;
  _count?: { students: number; liveClasses: number };
}

export default function TeacherCohortsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/portals/teacher/cohorts')
      .then(r => setCohorts(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5">
        <div className="h-10 w-48 rounded-xl bg-cloud animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1,2,3].map(i => <SkeletonCard key={i} lines={3} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="My Cohorts" subtitle="Manage your student groups" />
      <div className="flex-1 p-4 pb-28 lg:p-6 lg:pb-6 space-y-5">
        <TeacherCohortsHero />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">COHORTS</p>
            <h2 className="text-base font-bold text-navy">{cohorts.length} active group{cohorts.length !== 1 ? 's' : ''}</h2>
          </div>
        </div>

        {cohorts.length === 0 ? (
          <Card padding="lg">
            <EmptyState
              icon="mentorship"
              title="No cohorts assigned"
              description="Admin will assign student cohorts to you"
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {cohorts.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, ...spring.smooth }}
              >
              <Link href={`/teacher/cohorts/${c.id}`}>
                <Card hover padding="none" className="overflow-hidden h-full">
                  <div className="bg-navy p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-azure/20 mb-3">
                      <Icon name="mentorship" size={20} className="text-azure" />
                    </div>
                    <h3 className="text-base font-bold text-white leading-snug">{c.name}</h3>
                    <p className="text-xs text-white/40 mt-1">{c.package?.name ?? 'Package'}</p>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-royal/60">
                        <IconBox className="h-6 w-6 rounded-lg"><Icon name="mentorship" size={11} /></IconBox>
                        {c._count?.students ?? 0} students
                      </div>
                      <Badge variant="active">Active</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-royal/60">
                      <IconBox className="h-6 w-6 rounded-lg"><Icon name="live" size={11} /></IconBox>
                      {c._count?.liveClasses ?? 0} sessions
                    </div>
                    <div className="flex items-center gap-1 text-xs text-azure font-semibold mt-1">
                      View cohort <Icon name="chevronRight" size={12} />
                    </div>
                  </div>
                </Card>
              </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
