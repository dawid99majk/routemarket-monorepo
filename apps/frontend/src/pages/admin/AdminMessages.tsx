import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare, Send, Loader2, Search, ChevronLeft, User, Mail,
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface AdminConversation {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  subject: string | null;
  status: string;
  updated_at: string;
  created_at: string;
  display_name?: string;
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

export default function AdminMessages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['admin-conversations'],
    queryFn: async () => {
      const { data: convs, error } = await supabase
        .from('conversations')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const userIds = (convs ?? []).filter(c => c.user_id).map(c => c.user_id!);
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);
        (profiles ?? []).forEach(p => { profileMap[p.user_id] = p.display_name || ''; });
      }

      const convIds = (convs ?? []).map(c => c.id);
      let unreadMap: Record<string, number> = {};
      if (convIds.length > 0) {
        const { data: msgs } = await supabase
          .from('messages')
          .select('conversation_id, is_read')
          .in('conversation_id', convIds)
          .eq('is_read', false)
          .neq('sender_type', 'admin');
        (msgs ?? []).forEach(m => {
          unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] || 0) + 1;
        });
      }

      return (convs ?? []).map(c => ({
        ...c,
        display_name: c.user_id ? profileMap[c.user_id] : c.guest_name,
        unread_count: unreadMap[c.id] || 0,
      })) as AdminConversation[];
    },
  });

  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ['admin-conv-messages', selectedConvId],
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

  // Mark as read
  useEffect(() => {
    if (!selectedConvId || !user || messages.length === 0) return;
    const unread = messages.filter(m => !m.is_read && m.sender_type !== 'admin').map(m => m.id);
    if (unread.length > 0) {
      supabase.from('messages').update({ is_read: true }).in('id', unread)
        .then(() => queryClient.invalidateQueries({ queryKey: ['admin-conversations'] }));
    }
  }, [messages, selectedConvId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('admin-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-conversations'] });
        if (selectedConvId) queryClient.invalidateQueries({ queryKey: ['admin-conv-messages', selectedConvId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConvId]);

  const filteredConvs = conversations.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.display_name || '').toLowerCase().includes(q) ||
      (c.guest_email || '').toLowerCase().includes(q) ||
      (c.subject || '').toLowerCase().includes(q)
    );
  });

  // Sort: unread first, then by updated_at
  const sortedConvs = [...filteredConvs].sort((a, b) => {
    if (a.unread_count > 0 && b.unread_count === 0) return -1;
    if (b.unread_count > 0 && a.unread_count === 0) return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedConvId || !user) return;
    setSending(true);
    await supabase.from('messages').insert({
      conversation_id: selectedConvId,
      sender_id: user.id,
      sender_type: 'admin',
      content: newMessage.trim(),
    });
    setSending(false);
    setNewMessage('');
    queryClient.invalidateQueries({ queryKey: ['admin-conv-messages', selectedConvId] });
    queryClient.invalidateQueries({ queryKey: ['admin-conversations'] });
  };

  const selectedConv = conversations.find(c => c.id === selectedConvId);
  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0);

  return (
    <div className="p-4 sm:p-8 h-full">
      <div className="flex items-center gap-3 mb-4">
        <MessageSquare className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Wiadomości</h1>
        {totalUnread > 0 && (
          <Badge variant="destructive" className="rounded-full">{totalUnread}</Badge>
        )}
      </div>

      <div className="flex h-[calc(100vh-12rem)] bg-card rounded-xl border border-border overflow-hidden">
        {/* List */}
        <div className={`w-full sm:w-80 border-r border-border flex flex-col ${selectedConvId ? 'hidden sm:flex' : 'flex'}`}>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Szukaj po nazwie, emailu..."
                className="pl-10 h-9 text-sm"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : sortedConvs.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Brak konwersacji</div>
            ) : (
              sortedConvs.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors ${selectedConvId === conv.id ? 'bg-muted' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {conv.user_id ? <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <p className="text-sm font-medium truncate">{conv.display_name || conv.guest_email || 'Anonim'}</p>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.subject || 'Bez tematu'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(conv.updated_at), 'd MMM', { locale: pl })}
                      </span>
                      {conv.unread_count > 0 && (
                        <Badge variant="destructive" className="rounded-full text-[10px] px-1.5 min-w-[18px] h-[18px]">{conv.unread_count}</Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Chat */}
        <div className={`flex-1 flex flex-col ${!selectedConvId ? 'hidden sm:flex' : 'flex'}`}>
          {selectedConvId ? (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => setSelectedConvId(null)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{selectedConv?.display_name || selectedConv?.guest_email || 'Anonim'}</p>
                  <p className="text-xs text-muted-foreground truncate">{selectedConv?.subject || 'Bez tematu'}</p>
                </div>
                {selectedConv?.guest_email && (
                  <Badge variant="outline" className="text-xs shrink-0">{selectedConv.guest_email}</Badge>
                )}
              </div>

              <ScrollArea className="flex-1 px-4 py-4">
                {loadingMsgs ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : (
                  <div className="space-y-3">
                    {messages.map(msg => {
                      const isAdmin = msg.sender_type === 'admin';
                      return (
                        <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${isAdmin ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted text-foreground rounded-bl-md'}`}>
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                            <p className={`text-[10px] mt-1 ${isAdmin ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                              {format(new Date(msg.created_at), 'HH:mm')}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              <div className="p-3 border-t border-border">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Odpowiedz..."
                    className="min-h-[44px] max-h-32 resize-none"
                    rows={1}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  />
                  <Button size="icon" onClick={handleSend} disabled={sending || !newMessage.trim()} className="shrink-0 h-[44px] w-[44px]">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Wybierz konwersację</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
