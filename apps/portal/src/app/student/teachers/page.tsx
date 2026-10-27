'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface Teacher {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  videoIntroUrl?: string;
  bio?: string;
  country?: { name: string; code: string };
  yearsExperience?: number;
  qualification?: string;
  subjectAreas: string[];
  teachingModality?: string;
  avgRating?: number;
  reviewCount: number;
  cohortCount: number;
  courseCount: number;
}

export default function TeachersDirectoryPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get('/teachers', { params: { page, limit: 12 } })
      .then(r => {
        setTeachers(r.data.data);
        setTotal(r.data.total);
        setPages(r.data.pages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  const filtered = search
    ? teachers.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.subjectAreas.some(s => s.toLowerCase().includes(search.toLowerCase()))
      )
    : teachers;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Our Teachers" subtitle="Browse qualified educators across Africa" />

      <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6">
        {/* Search */}
        <div className="relative mb-6 max-w-md">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-royal/40" size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or subject..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-cloud bg-white text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40"
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} lines={3} />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card padding="lg">
            <EmptyState icon="mentorship" title="No teachers found" description="Try a different search term" />
          </Card>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-4">{total} educators</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(teacher => (
                <TeacherCard key={teacher.id} teacher={teacher} />
              ))}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex justify-center gap-2 mt-10">
                {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      p === page
                        ? 'bg-azure text-white'
                        : 'bg-white border border-cloud text-navy hover:bg-cloud'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TeacherCard({ teacher }: { teacher: Teacher }) {
  const initials = [teacher.firstName?.[0], teacher.lastName?.[0]].filter(Boolean).join('') ||
    teacher.name[0].toUpperCase();

  return (
    <Link href={`/student/teachers/${teacher.id}`} className="block group">
      <div className="bg-white rounded-2xl border border-cloud p-6 hover:shadow-lg hover:border-azure/40 transition-all duration-200 h-full flex flex-col">
        {/* Avatar + name */}
        <div className="flex items-start gap-4 mb-4">
          <div className="relative flex-shrink-0">
            {teacher.avatarUrl ? (
              <Image
                src={teacher.avatarUrl}
                alt={teacher.name}
                width={56}
                height={56}
                className="rounded-full object-cover w-14 h-14"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-cloud flex items-center justify-center text-azure font-bold text-lg">
                {initials}
              </div>
            )}
            {teacher.videoIntroUrl && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-azure border-2 border-white">
                <Icon name="play" size={9} className="text-white" />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-navy text-base leading-tight group-hover:text-azure transition-colors truncate">
              {teacher.name}
            </h3>
            {teacher.country && (
              <p className="text-xs text-royal/50 mt-0.5 flex items-center gap-1">
                <Icon name="location" size={12} />
                {teacher.country.name}
              </p>
            )}
            {teacher.avgRating && (
              <div className="flex items-center gap-1 mt-1">
                <Icon name="star" size={13} className="text-amber-400" />
                <span className="text-xs font-semibold text-navy">{teacher.avgRating}</span>
                <span className="text-xs text-royal/40">({teacher.reviewCount})</span>
              </div>
            )}
          </div>
        </div>

        {/* Bio */}
        {teacher.bio && (
          <p className="text-sm text-royal/60 line-clamp-2 mb-4 flex-1">{teacher.bio}</p>
        )}

        {/* Subject tags */}
        {teacher.subjectAreas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {teacher.subjectAreas.slice(0, 3).map(s => (
              <span key={s} className="text-xs bg-cloud text-royal px-2 py-0.5 rounded-full font-medium">
                {s}
              </span>
            ))}
            {teacher.subjectAreas.length > 3 && (
              <span className="text-xs bg-cloud text-royal/50 px-2 py-0.5 rounded-full">
                +{teacher.subjectAreas.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 pt-4 border-t border-cloud text-xs text-royal/50">
          <span className="flex items-center gap-1">
            <Icon name="courses" size={13} className="text-azure" />
            {teacher.courseCount} course{teacher.courseCount !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Icon name="mentorship" size={13} className="text-azure" />
            {teacher.cohortCount} cohort{teacher.cohortCount !== 1 ? 's' : ''}
          </span>
          {teacher.yearsExperience && (
            <span className="flex items-center gap-1">
              <Icon name="graduate" size={13} className="text-azure" />
              {teacher.yearsExperience}yr
            </span>
          )}
          {teacher.videoIntroUrl && (
            <span className="ml-auto flex items-center gap-1 text-azure font-semibold">
              <Icon name="play" size={12} /> Intro
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
