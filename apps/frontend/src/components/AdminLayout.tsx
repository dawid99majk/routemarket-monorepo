import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, ShieldCheck, ArrowLeft, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/atlas', label: 'Atlas', icon: Bot },
] as const;
export default function AdminLayout() {
  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 bg-card border-r border-border flex flex-col shrink-0">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-border">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">Admin Panel</span>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin/dashboard'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <a href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5 shrink-0" />
            Back to site
          </a>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
