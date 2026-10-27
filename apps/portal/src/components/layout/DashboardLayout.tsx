import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface Crumb { label: string; href?: string; }

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
}

export function DashboardLayout({
  children,
  title,
  subtitle,
  backHref,
  backLabel,
  actions,
  breadcrumbs,
}: DashboardLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          title={title}
          subtitle={subtitle}
          backHref={backHref}
          backLabel={backLabel}
          actions={actions}
          breadcrumbs={breadcrumbs}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}
