import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import Logo from '@/components/Logo';
import Footer from '@/components/Footer';
import { toast } from 'sonner';
import {
  ArrowLeft, MessageSquare, Send, Loader2, Plus, ChevronLeft, Mail,
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface Conversation {
  id: string;
  subject: string | null;
  status: string;
  updated_at: string;
  created_at: string;
  unread_count: number;
}

interface Message {
  id: string;
  content: string;
  sender_id: string | null;
  sender_type: string;
  is_read: boolean;
  created_at: string;
}

export default function Messages() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newContent, setNewContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations
  const { data: conversations = [], isLoading: loadingConvs } = useQuery({
    queryKey: ['user-conversations', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: convs, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;

      // Get unread counts
      const convIds = (convs ?? []).map(c => c.id);
      if (convIds.length === 0) return [];

      const { data: msgs } = await supabase
        .from('messages')
        .select('conversation_id, is_read')
        .in('conversation_id', convIds)
        .eq('is_read', false)
        .neq('sender_type', 'user');

      const unreadMap: Record<string, number> = {};
      (msgs ?? []).forEach(m => {
        unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] || 0) + 1;
      });

      return (convs ?? []).map(c => ({
        ...c,
        unread_count: unreadMap[c.id] || 0,
      })) as Conversation[];
    },
  });

  // Fetch messages for selected conversation
  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ['conversation-messages', selectedConvId],
    enabled: !!selectedConvId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', selectedConvId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  // Mark messages as read
  useEffect(() => {
    if (!selectedConvId || !user || messages.length === 0) return;
    const unreadIds = messages
      .filter(m => !m.is_read && m.sender_type !== 'user')
      .map(m => m.id);
    if (unreadIds.length > 0) {
      supabase
        .from('messages')
        .update({ is_read: true })
        .in('id', unreadIds)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['user-conversations'] });
        });
    }
  }, [messages, selectedConvId, user]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime subscription
  useEffect(() => {
    if (!selectedConvId) return;
    const channel = supabase
      .channel(`messages-${selectedConvId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedConvId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedConvId] });
        queryClient.invalidateQueries({ queryKey: ['user-conversations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConvId]);

  const totalUnread = useMemo(() => conversations.reduce((s, c) => s + c.unread_count, 0), [conversations]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConvId || !user) return;
    setSending(true);
    const { error } = await supabase.from('messages').insert({
      conversation_id: selectedConvId,
      sender_id: user.id,
      sender_type: 'user',
      content: newMessage.trim(),
    });
    setSending(false);
    if (error) { toast.error('Błąd wysyłania'); return; }
    setNewMessage('');
    queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedConvId] });
    queryClient.invalidateQueries({ queryKey: ['user-conversations'] });
  };

  const handleCreateConversation = async () => {
    if (!newSubject.trim() || !newContent.trim() || !user) return;
    setSending(true);
    try {
      const { data: conv, error: cErr } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, subject: newSubject.trim() })
        .select('id')
        .single();
      if (cErr) throw cErr;

      const { error: mErr } = await supabase.from('messages').insert({
        conversation_id: conv.id,
        sender_id: user.id,
        sender_type: 'user',
        content: newContent.trim(),
      });
      if (mErr) throw mErr;

      setShowNewForm(false);
      setNewSubject('');
      setNewContent('');
      setSelectedConvId(conv.id);
      queryClient.invalidateQueries({ queryKey: ['user-conversations'] });
      toast.success('Wiadomość wysłana');
    } catch {
      toast.error('Błąd tworzenia konwersacji');
    } finally {
      setSending(false);
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!user) { navigate('/auth'); return null; }

  const selectedConv = conversations.find(c => c.id === selectedConvId);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mr-4">
              <ArrowLeft className="w-4 h-4 mr-1" /> Strona główna
            </Button>
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <span className="font-semibold">Wiadomości</span>
            {totalUnread > 0 && (
              <Badge variant="destructive" className="rounded-full text-xs px-1.5 min-w-[20px] h-5">{totalUnread}</Badge>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-0 sm:px-4 py-0 sm:py-6">
        <div className="flex h-[calc(100vh-10rem)] bg-card rounded-none sm:rounded-xl border-0 sm:border border-border overflow-hidden">
          {/* Conversation list */}
          <div className={`w-full sm:w-80 border-r border-border flex flex-col ${selectedConvId ? 'hidden sm:flex' : 'flex'}`}>
            <div className="p-3 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-sm">Konwersacje</h2>
              <Button size="sm" variant="ghost" onClick={() => { setShowNewForm(true); setSelectedConvId(null); }}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              {loadingConvs ? (
                <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Mail className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                  Brak wiadomości
                </div>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => { setSelectedConvId(conv.id); setShowNewForm(false); }}
                    className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors ${selectedConvId === conv.id ? 'bg-muted' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium truncate flex-1">{conv.subject || 'Bez tematu'}</p>
                      {conv.unread_count > 0 && (
                        <Badge variant="destructive" className="rounded-full text-[10px] px-1.5 min-w-[18px] h-[18px] shrink-0">{conv.unread_count}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(conv.updated_at), 'd MMM, HH:mm', { locale: pl })}
                    </p>
                  </button>
                ))
              )}
            </ScrollArea>
          </div>

          {/* Chat area */}
          <div className={`flex-1 flex flex-col ${!selectedConvId && !showNewForm ? 'hidden sm:flex' : 'flex'}`}>
            {showNewForm ? (
              <div className="flex-1 flex flex-col p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4 sm:hidden">
                  <Button variant="ghost" size="sm" onClick={() => setShowNewForm(false)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="font-semibold text-sm">Nowa wiadomość</span>
                </div>
                <h2 className="text-lg font-semibold mb-4 hidden sm:block">Nowa wiadomość do administracji</h2>
                <div className="space-y-4 max-w-lg">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Temat</label>
                    <Input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="O czym chcesz porozmawiać?" maxLength={200} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Wiadomość</label>
                    <Textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Napisz swoją wiadomość..." rows={6} maxLength={5000} />
                  </div>
                  <Button onClick={handleCreateConversation} disabled={sending || !newSubject.trim() || !newContent.trim()} className="gap-2">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Wyślij
                  </Button>
                </div>
              </div>
            ) : selectedConvId ? (
              <>
                {/* Chat header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => setSelectedConvId(null)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedConv?.subject || 'Bez tematu'}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedConv ? format(new Date(selectedConv.created_at), 'd MMM yyyy', { locale: pl }) : ''}
                    </p>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 px-4 py-4">
                  {loadingMsgs ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-8">Brak wiadomości</p>
                  ) : (
                    <div className="space-y-3">
                      {messages.map(msg => {
                        const isOwn = msg.sender_type === 'user' || msg.sender_id === user?.id;
                        return (
                          <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${isOwn ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted text-foreground rounded-bl-md'}`}>
                              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                              <p className={`text-[10px] mt-1 ${isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                                {format(new Date(msg.created_at), 'HH:mm', { locale: pl })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* Input */}
                <div className="p-3 border-t border-border">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      placeholder="Napisz wiadomość..."
                      className="min-h-[44px] max-h-32 resize-none"
                      rows={1}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    />
                    <Button size="icon" onClick={handleSendMessage} disabled={sending || !newMessage.trim()} className="shrink-0 h-[44px] w-[44px]">
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-6">
                <div>
                  <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Wybierz konwersację lub utwórz nową</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
