import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Plus, Trash2, ChevronDown, Fuel, Wifi, Cloud, Ticket, Lightbulb, Star } from 'lucide-react';
import type { WizardState, WizardTip, WizardRecommendation } from '@/hooks/use-wizard-state';

const BEFORE_YOU_GO = [
  { key: 'before_start_fuel', i18n: 'fuel', icon: Fuel },
  { key: 'before_start_network', i18n: 'network', icon: Wifi },
  { key: 'before_start_weather', i18n: 'weather', icon: Cloud },
  { key: 'before_start_permits', i18n: 'permits', icon: Ticket },
];
const PRICE_RANGE_VALUES = ['budget', 'mid-range', 'premium'] as const;

interface Props {
  state: WizardState;
  dispatch: React.Dispatch<any>;
  setField: (field: string, value: any) => void;
}

export default function StepTipsRecommendations({ state, dispatch, setField }: Props) {
  const { t } = useTranslation();
  // Helper to find/update "Before You Go" tips by category
  const getBeforeTip = (category: string) => state.tips.find(t => t.category === category);
  
  const updateBeforeTip = useCallback((category: string, content: string) => {
    const idx = state.tips.findIndex(t => t.category === category);
    if (idx >= 0) {
      dispatch({ type: 'UPDATE_TIP', index: idx, tip: { ...state.tips[idx], content } });
    } else {
      dispatch({ type: 'ADD_TIP', tip: { category, content, sort_order: state.tips.length } });
    }
  }, [state.tips, dispatch]);

  // Good tips (category = 'good_tip')
  const goodTips = state.tips.filter(t => t.category === 'good_tip');
  const addGoodTip = () => {
    dispatch({ type: 'ADD_TIP', tip: { category: 'good_tip', content: '', sort_order: state.tips.length } });
  };

  const updateGoodTip = (tipIndex: number, content: string) => {
    const globalIndex = state.tips.findIndex((t, i) => {
      let count = 0;
      for (let j = 0; j <= i; j++) {
        if (state.tips[j].category === 'good_tip') count++;
      }
      return t.category === 'good_tip' && count - 1 === tipIndex;
    });
    if (globalIndex >= 0) {
      dispatch({ type: 'UPDATE_TIP', index: globalIndex, tip: { ...state.tips[globalIndex], content } });
    }
  };

  const removeGoodTip = (tipIndex: number) => {
    let count = -1;
    const globalIndex = state.tips.findIndex(t => {
      if (t.category === 'good_tip') count++;
      return count === tipIndex;
    });
    if (globalIndex >= 0) dispatch({ type: 'REMOVE_TIP', index: globalIndex });
  };

  // Recommendations
  const addRecommendation = () => {
    dispatch({
      type: 'ADD_RECOMMENDATION',
      rec: { name: '', description: '', what_to_order: '', price_range: 'mid-range', photo_key: '', sort_order: state.recommendations.length },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{t('wizard.step5.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('wizard.step5.subtitle')}</p>
      </div>

      {/* Before You Go */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="w-full flex items-center justify-between bg-card rounded-t-xl p-4 border border-border hover:bg-muted/50 transition-colors">
          <span className="font-semibold flex items-center gap-2">📋 {t('wizard.step5.before_title')}</span>
          <ChevronDown className="w-4 h-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="bg-card rounded-b-xl p-4 border-x border-b border-border space-y-4">
          {BEFORE_YOU_GO.map((field) => {
            const Icon = field.icon;
            const tip = getBeforeTip(field.key);
            return (
              <div key={field.key}>
                <Label className="flex items-center gap-1"><Icon className="w-3.5 h-3.5" /> {t(`wizard.step5.before_${field.i18n}`)}</Label>
                <Textarea
                  value={tip?.content ?? ''}
                  onChange={(e) => updateBeforeTip(field.key, e.target.value)}
                  placeholder={t(`wizard.step5.before_${field.i18n}_ph`)}
                  rows={2}
                />
              </div>
            );
          })}
        </CollapsibleContent>
      </Collapsible>

      {/* Good Tips */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="w-full flex items-center justify-between bg-card rounded-t-xl p-4 border border-border hover:bg-muted/50 transition-colors">
          <span className="font-semibold flex items-center gap-2"><Lightbulb className="w-4 h-4" /> {t('wizard.step5.good_tips')}</span>
          <ChevronDown className="w-4 h-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="bg-card rounded-b-xl p-4 border-x border-b border-border space-y-3">
          {goodTips.map((_, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-sm text-muted-foreground mt-2 w-6 shrink-0">{i + 1}.</span>
              <Input
                value={goodTips[i].content}
                onChange={(e) => updateGoodTip(i, e.target.value)}
                placeholder={t('wizard.step5.good_tip_placeholder')}
              />
              <Button variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => removeGoodTip(i)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          {goodTips.length < 10 && (
            <Button variant="outline" size="sm" onClick={addGoodTip}>
              <Plus className="w-4 h-4 mr-1" /> {t('wizard.step5.add_tip')}
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Recommendations */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="w-full flex items-center justify-between bg-card rounded-t-xl p-4 border border-border hover:bg-muted/50 transition-colors">
          <span className="font-semibold flex items-center gap-2"><Star className="w-4 h-4" /> {t('wizard.step5.recommendations')}</span>
          <ChevronDown className="w-4 h-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="bg-card rounded-b-xl p-4 border-x border-b border-border space-y-4">
          {state.recommendations.map((rec, i) => (
            <div key={i} className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{t('wizard.step5.rec_label', { n: i + 1 })}</span>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => dispatch({ type: 'REMOVE_RECOMMENDATION', index: i })}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>{t('wizard.step5.rec_name')} <span className="text-destructive">*</span></Label>
                  <Input
                    value={rec.name}
                    onChange={(e) => dispatch({ type: 'UPDATE_RECOMMENDATION', index: i, rec: { ...rec, name: e.target.value } })}
                    placeholder={t('wizard.step5.rec_name_ph')}
                  />
                </div>
                <div>
                  <Label>{t('wizard.step5.rec_price_range')}</Label>
                  <Select value={rec.price_range} onValueChange={(v) => dispatch({ type: 'UPDATE_RECOMMENDATION', index: i, rec: { ...rec, price_range: v } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRICE_RANGE_VALUES.map((p) => (
                        <SelectItem key={p} value={p}>{t(`wizard.step5.price_ranges.${p}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t('wizard.step5.rec_description')}</Label>
                <Textarea
                  value={rec.description}
                  onChange={(e) => dispatch({ type: 'UPDATE_RECOMMENDATION', index: i, rec: { ...rec, description: e.target.value } })}
                  placeholder={t('wizard.step5.rec_description_ph')}
                  rows={2}
                />
              </div>
              <div>
                <Label>{t('wizard.step5.rec_what_to_order')}</Label>
                <Input
                  value={rec.what_to_order}
                  onChange={(e) => dispatch({ type: 'UPDATE_RECOMMENDATION', index: i, rec: { ...rec, what_to_order: e.target.value } })}
                  placeholder={t('wizard.step5.rec_what_to_order_ph')}
                />
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRecommendation}>
            <Plus className="w-4 h-4 mr-1" /> {t('wizard.step5.add_recommendation')}
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
