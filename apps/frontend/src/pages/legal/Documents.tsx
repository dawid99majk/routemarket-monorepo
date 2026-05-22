import { Link } from 'react-router-dom';
import { FileText, Shield, Cookie, RotateCcw, ShieldCheck, Copyright, Users, Scale } from 'lucide-react';
import LegalLayout from '@/components/LegalLayout';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const CORE_DOCS = [
  { to: '/legal/terms', icon: FileText, title: 'Terms of Service', desc: 'Rules governing use of the RouteMarket.io platform.' },
  { to: '/legal/privacy', icon: Shield, title: 'Privacy Policy', desc: 'How we collect, use, and protect your personal data.' },
  { to: '/legal/cookies', icon: Cookie, title: 'Cookie Policy', desc: 'Information about cookies and tracking technologies.' },
  { to: '/legal/refunds', icon: RotateCcw, title: 'Refund & Returns Policy', desc: 'Your rights regarding refunds and digital content.' },
  { to: '/legal/acceptable-use', icon: ShieldCheck, title: 'Acceptable Use Policy', desc: 'Permitted and prohibited content and behavior on the Platform.' },
  { to: '/legal/copyright', icon: Copyright, title: 'Copyright & DMCA Policy', desc: 'How we handle copyright infringement and takedown requests.' },
  { to: '/legal/creator-agreement', icon: Users, title: 'Creator Agreement', desc: 'Terms for Creators publishing Route Packages on RouteMarket.io.' },
  { to: '/legal/dsa-compliance', icon: Scale, title: 'DSA Compliance & Transparency', desc: 'How RouteMarket.io complies with the Digital Services Act.' },
];

export default function Documents() {
  return (
    <LegalLayout docKey="">
      <h1>Documents</h1>
      <p className="text-muted-foreground mb-8">All legal and policy documents for RouteMarket.io.</p>

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
