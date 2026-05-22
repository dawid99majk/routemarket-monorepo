import { useState } from 'react';
import { useRouteTranslations, useUpdateTranslation, useDeleteTranslation, SUPPORTED_LANGUAGES } from '@/hooks/use-translations';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Languages, Loader2, Pencil, Trash2, Plus, Check, X, Bot, UserPen } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  routeId: number;
  originalTitle: string;
  originalDescription: string;
}

export default function TranslationManager({ routeId, originalTitle, originalDescription }: Props) {
  const { data: translations = [], isLoading } = useRouteTranslations(routeId);
  const updateMutation = useUpdateTranslation();
  const deleteMutation = useDeleteTranslation();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [generating, setGenerating] = useState<string | null>(null);
  const [newLang, setNewLang] = useState('');

  const existingLangs = new Set(translations.map((t) => t.language_code));
  const availableLangs = SUPPORTED_LANGUAGES.filter((l) => !existingLangs.has(l.code));

  const startEdit = (t: { id: number; title: string; description: string }) => {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditDesc(t.description);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditDesc('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await updateMutation.mutateAsync({ id: editingId, title: editTitle, description: editDesc });
      toast.success('Translation updated');
      cancelEdit();
    } catch {
      toast.error('Failed to save translation');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Translation deleted');
    } catch {
      toast.error('Failed to delete translation');
    }
  };

  const generateTranslation = async (langCode: string) => {
    setGenerating(langCode);
    try {
      const { data, error } = await supabase.functions.invoke('translate-route', {
        body: { route_id: routeId, language_code: langCode },
      });
      if (error) throw error;
      toast.success(`Translation generated for ${langCode.toUpperCase()}`);
      // Refetch
      window.location.reload(); // Simple refresh; could use queryClient instead
    } catch (err: any) {
      toast.error(err.message || 'Translation failed');
    } finally {
      setGenerating(null);
      setNewLang('');
    }
  };

  return (
    <div className="bg-card rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Languages className="w-5 h-5" /> Translations
      </h2>

      {/* Original */}
      <div className="mb-4 p-3 bg-muted rounded-lg">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs">Original</Badge>
        </div>
        <p className="font-medium text-sm">{originalTitle}</p>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{originalDescription}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {translations.map((t) => (
            <div key={t.id} className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium uppercase">{t.language_code}</span>
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    {t.is_auto_translated ? <><Bot className="w-3 h-3" /> AI</> : <><UserPen className="w-3 h-3" /> Manual</>}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  {editingId === t.id ? (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit} disabled={updateMutation.isPending}>
                        <Check className="w-3.5 h-3.5 text-green-600" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(t)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(t.id)} disabled={deleteMutation.isPending}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {editingId === t.id ? (
                <div className="space-y-2">
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" className="text-sm" />
                  <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" rows={3} className="text-sm" />
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new translation */}
      {availableLangs.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <Select value={newLang} onValueChange={setNewLang}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="Add language..." />
            </SelectTrigger>
            <SelectContent>
              {availableLangs.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.flag} {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!newLang || generating !== null}
            onClick={() => newLang && generateTranslation(newLang)}
            className="gap-1"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Generate
          </Button>
        </div>
      )}
    </div>
  );
}
