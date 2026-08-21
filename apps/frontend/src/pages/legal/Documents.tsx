import { Link } from 'react-router-dom';
import { FileText, Shield, Cookie, ShieldCheck, Copyright } from 'lucide-react';
import LegalLayout from '@/components/LegalLayout';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const CORE_DOCS = [
  { to: '/legal/terms', icon: FileText, title: 'Terms of Service', desc: 'What the Service does, what your account is for, and where responsibility lies.' },
  { to: '/legal/privacy', icon: Shield, title: 'Privacy Policy', desc: 'What data we hold, who else sees it, and how to get it removed.' },
  { to: '/legal/cookies', icon: Cookie, title: 'Cookie Policy', desc: 'What we store in your browser and what only happens with your consent.' },
  { to: '/legal/acceptable-use', icon: ShieldCheck, title: 'Acceptable Use Policy', desc: 'Rules for published boards, and how to report something.' },
  { to: '/legal/copyright', icon: Copyright, title: 'Copyright Policy', desc: 'Where our material comes from, and what to do if yours appears here.' },
];

export default function Documents() {
  return (
    <LegalLayout docKey="">
      <h1>Documents</h1>
      <p className="text-muted-foreground mb-8">Everything governing how RouteMarket works and how your data is handled.</p>

      <div className="grid gap-4 sm:grid-cols-2 not-prose">
        {CORE_DOCS.map(({ to, icon: Icon, title, desc }) => (
          <Link key={to} to={to}>
            <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-primary shrink-0" />
                  <div>
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription className="mt-1">{desc}</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </LegalLayout>
  );
}
