import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import Footer from '@/components/Footer';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import {
  Bike, Mountain, Compass, Upload, DollarSign, Users,
  Eye, Award, Heart, ArrowRight, Sparkles, CheckCircle2,
  MapPin, Zap, Shield,
} from 'lucide-react';

const AUDIENCES = [
  { icon: Bike, label: 'Cyclists', desc: 'Road, gravel, MTB routes' },
  { icon: Mountain, label: 'Motorcyclists', desc: 'Touring & adventure rides' },
  { icon: Compass, label: 'Travelers', desc: 'Hiking & outdoor trails' },
  { icon: MapPin, label: 'GPX Creators', desc: 'Sell your local knowledge' },
];

const STEPS = [
  { icon: Upload, step: '01', title: 'Upload your GPX', desc: 'Add your route file, photos, and a PDF guide with tips and waypoints.' },
  { icon: DollarSign, step: '02', title: 'Set your price', desc: 'You decide. Earn 65% of every sale — payouts via Stripe Connect.' },
  { icon: Users, step: '03', title: 'Users discover & buy', desc: 'Riders and explorers find your routes on the marketplace and purchase instantly.' },
];

const REASONS = [
  { icon: Eye, title: 'Early visibility', desc: 'First creators get featured placement and maximum exposure on launch.' },
  { icon: Award, title: 'Build your portfolio', desc: 'Start building your route catalog and reputation before the crowd.' },
  { icon: Heart, title: 'Shape the community', desc: 'Your feedback drives the platform. Be part of the founding creator circle.' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo size="xl" />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" onClick={() => navigate('/contact')} className="min-h-[44px]">
              Contact
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/auth')} className="min-h-[44px]">
              {t('common.login')}
            </Button>
            <Button size="sm" onClick={() => navigate('/auth?mode=signup')} className="min-h-[44px] bg-accent hover:bg-accent/90 text-accent-foreground font-semibold">
              {t('common.signup')}
            </Button>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
        <div className="absolute top-20 right-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent border border-accent/20 text-sm font-medium mb-8">
            <Sparkles className="w-4 h-4" />
            Early Access — Join the founding creators
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.1] mb-6">
            Sell your routes.{' '}
            <span className="text-primary">Build your audience.</span>{' '}
            <br className="hidden sm:block" />
            Earn from your passion.
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            RouteMarket is the marketplace for creators of cycling, motorcycle & outdoor routes.
            Upload GPX files, set your price, and start earning.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={() => navigate('/auth?mode=signup')}
              className="min-h-[52px] px-8 text-base font-semibold bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg shadow-accent/25 gap-2"
            >
              <Zap className="w-5 h-5" />
              Join as Creator (Early Access)
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate('/auth?mode=signup')}
              className="min-h-[52px] px-8 text-base font-semibold gap-2"
            >
              Create Account
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── FOR WHO ── */}
      <section className="py-16 sm:py-24 bg-card border-y border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-4">
            Built for route creators
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
            Whether you ride, hike or explore — if you know the best routes, you can monetize them.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {AUDIENCES.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="group relative p-6 rounded-xl bg-background border border-border hover:border-primary/30 hover:shadow-md transition-all duration-300 text-center"
              >
                <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{label}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-4">
            How it works
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
            Three steps from your favorite route to your first sale.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map(({ icon: Icon, step, title, desc }) => (
              <div key={step} className="relative">
                <span className="text-6xl font-black text-primary/10 absolute -top-4 -left-2 select-none">{step}</span>
                <div className="relative pt-8 pl-2">
                  <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY JOIN NOW ── */}
      <section className="py-16 sm:py-24 bg-gradient-to-b from-primary/5 to-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-4">
            Why join now?
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
            Early creators get the biggest advantage.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {REASONS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="p-6 rounded-xl bg-card border border-border hover:shadow-lg transition-shadow duration-300"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATUS ── */}
      <section className="py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-warning/10 text-warning border border-warning/20 text-sm font-medium mb-6">
            <Shield className="w-4 h-4" />
            Platform Status
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3">
            Currently in development
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto mb-8 leading-relaxed">
            The marketplace is being built. Create your account now to secure your spot as a founding creator.
            You'll get early access when we launch.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-success" /> Creator accounts active
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-success" /> Route upload ready
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-warning" /> Marketplace coming soon
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-16 sm:py-20 bg-primary">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-primary-foreground mb-4">
            Ready to turn your routes into income?
          </h2>
          <p className="text-primary-foreground/80 mb-8 max-w-lg mx-auto">
            Join RouteMarket today. Create your creator account, upload your first route, and be ready for launch.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={() => navigate('/auth?mode=signup')}
              className="min-h-[52px] px-8 text-base font-semibold bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg gap-2"
            >
              <Zap className="w-5 h-5" />
              Join as Creator
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate('/auth')}
              className="min-h-[52px] px-8 text-base font-semibold bg-primary-foreground text-primary hover:bg-primary-foreground/90 gap-2"
            >
              {t('common.login')}
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
