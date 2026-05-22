import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import Logo from '@/components/Logo';
import Footer from '@/components/Footer';
import SEO from '@/components/SEO';
import { toast } from 'sonner';
import { ArrowLeft, Send, Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().email('Invalid email').max(255),
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  message: z.string().trim().min(1, 'Message is required').max(5000),
});

export default function Contact() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    subject: '',
    message: '',
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = contactSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    setSending(true);
    try {
      // Generate ID client-side so we don't need SELECT access for anon users
      const convId = crypto.randomUUID();

      // Create conversation
      const { error: convErr } = await supabase
        .from('conversations')
        .insert({
          id: convId,
          user_id: user?.id || null,
          guest_name: user ? null : parsed.data.name,
          guest_email: user ? null : parsed.data.email,
          subject: parsed.data.subject,
        });

      if (convErr) throw convErr;

      // Insert first message
      const { error: msgErr } = await supabase
        .from('messages')
        .insert({
          conversation_id: convId,
          sender_id: user?.id || null,
          sender_type: user ? 'user' : 'guest',
          content: parsed.data.message,
        });

      if (msgErr) throw msgErr;

      setSent(true);
      toast.success('Wiadomość wysłana!');
    } catch (err: any) {
      toast.error(err.message || 'Błąd wysyłania wiadomości');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEO title={t('seo.contact.title')} description={t('seo.contact.description')} url="/contact" />
        <header className="sticky top-0 z-40 bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mr-4">
              <ArrowLeft className="w-4 h-4 mr-1" /> Strona główna
            </Button>
            <Logo size="sm" />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Dziękujemy za wiadomość!</h1>
            <p className="text-muted-foreground mb-6">
              Odpowiemy najszybciej jak to możliwe na adres {form.email || user?.email}.
            </p>
            <Button onClick={() => navigate('/')}>Wróć na stronę główną</Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO title={t('seo.contact.title')} description={t('seo.contact.description')} url="/contact" />
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mr-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> Strona główna
          </Button>
          <Logo size="sm" />
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 sm:py-12">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-primary/10 flex items-center justify-center">
            <Mail className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Kontakt</h1>
          <p className="text-muted-foreground">
            Masz pytanie? Napisz do nas — odpowiemy najszybciej jak to możliwe.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Możesz też napisać bezpośrednio: <a href="mailto:contact@routemarket.io" className="text-primary hover:underline font-medium">contact@routemarket.io</a>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 bg-card rounded-xl p-6 sm:p-8 shadow-token-sm border border-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Imię</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Twoje imię"
                maxLength={100}
                required
                disabled={!!user}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="twoj@email.com"
                maxLength={255}
                required
                disabled={!!user}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Temat</Label>
            <Input
              id="subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="O czym chcesz porozmawiać?"
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Wiadomość</Label>
            <Textarea
              id="message"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Opisz swoje pytanie lub problem..."
              rows={6}
              maxLength={5000}
              required
            />
            <p className="text-xs text-muted-foreground text-right">{form.message.length}/5000</p>
          </div>

          <Button type="submit" disabled={sending} className="w-full gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Wysyłanie...' : 'Wyślij wiadomość'}
          </Button>
        </form>
      </main>

      <Footer />
    </div>
  );
}
