import { useMachine } from '@xstate/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { apiPost } from '@/lib/api';
import { wizardMachine, WizardContext } from '@routemarket/atlas-workflow/wizard-machine';
import { TRIP_PRESETS, mergePreferences } from '@/lib/tripPresets';
import { fromPromise } from 'xstate';

function generateGpxString(coordinates: number[][], title: string): string {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteMarket" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${title}</name>
  </metadata>
  <trk>
    <name>${title}</name>
    <trkseg>`;
  
  for (const coord of coordinates) {
    // trackPoints przychodzą jako [lat, lng, ele]. Czytanie ich w kolejności
    // GeoJSON zamieniało osie i zapisywało trasę z Durrës na pustyni w Arabii
    // Saudyjskiej — plik wyglądał poprawnie aż do otwarcia w nawigacji.
    const lat = coord[0];
    const lon = coord[1];
    const ele = coord[2] || 0;
    gpx += `
      <trkpt lat="${lat}" lon="${lon}">
        <ele>${ele}</ele>
      </trkpt>`;
  }
  
  gpx += `
    </trkseg>
  </trk>
</gpx>`;
  return gpx;
}

/** Preferencje z profilu — wczytane raz i dołączane do każdej tury wywiadu. */
function useRoutePreferences() {
  const [prefs, setPrefs] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await (supabase as any)
        .from('route_preferences')
        .select('pace, popularity, wandering, dining, effort, crowds')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      if (!cancelled && data) setPrefs(data);
    })();
    return () => { cancelled = true; };
  }, []);
  return prefs;
}

export function useWizardMachine(initialProjectId: string | null = null) {
  const preferences = useRoutePreferences();
  const preferencesRef = useRef<Record<string, number> | null>(null);
  preferencesRef.current = preferences;
  // Memoize the machine to avoid recreation and restarts on every render
  const machine = useMemo(() => {
    return wizardMachine.provide({
      // Override machine actors with our actual logic
      actors: {
        chatActor: fromPromise(async ({ input }: any) => {
          const data = await apiPost<any>('/chat-interview', {
            // Przy ponowieniu (RETRY) tekst jest pusty — ostatnia wypowiedź
            // użytkownika siedzi już w transkrypcie i nie wolno jej dublować.
            messages: input.text
              ? [...input.context.chatMessages, { role: 'user', text: input.text }]
              : input.context.chatMessages,
            project_id: input.context.projectId,
            input_notes: input.context.inputNotes,
            current_waypoints: input.context.waypoints,
            vehicle_type: input.context.vehicleType,
            bike_subtype: input.context.bikeSubtype,
            routing_preference: input.context.routingPreference,
            trip_profile: input.context.tripProfile,
            // Charakter wyjazdu nadpisuje osie z profilu — ten sam człowiek na
            // delegacji chce czego innego niż na urlopie z dziećmi
            creator_preferences: mergePreferences(
              preferencesRef.current,
              TRIP_PRESETS.find((p) => p.label === input.context.tripProfile?.charakter)?.axes
            )
          });
          return {
            message: data.reply || data.message || data.text,
            done: data.done,
            suggested_waypoints: data.suggested_waypoints,
            distance_target_km: data.distance_target_km,
            phase: data.phase,
            suggested_title: data.suggested_title,
            options: data.options,
            allow_custom: data.allow_custom
          };
        }),
      routeGeneratorActor: fromPromise(async ({ input }: any) => {
        const { context } = input;
        
        if (context.waypoints.length < 2) {
           return {
             geometry: null,
             waypoints: context.waypoints,
             gpxData: null,
             guideText: null,
             title: 'Dodaj więcej punktów'
           };
        }
        
        const data = await apiPost<any>('/live-route', {
          points: context.waypoints,
          route_type: context.vehicleType === 'bicycle' ? context.bikeSubtype : context.vehicleType,
          intent: context.routingPreference,
          distance_target_km: context.distanceTargetKm
        });

        if (!data.geometry || !data.trackPoints) {
            throw new Error("Brak geometrii w odpowiedzi routingu.");
        }

        let finalGpx = generateGpxString(data.trackPoints, context.title || 'Nowa Trasa');

        // Bezpiecznik na zamianę osi. Kiedyś eksport lądował na pustyni w Arabii
        // Saudyjskiej, bo współrzędne czytane były w kolejności GeoJSON. Plik
        // wygląda wtedy poprawnie aż do otwarcia w nawigacji, więc porównujemy
        // pierwszy punkt śladu z pierwszym punktem trasy, zanim ktokolwiek go pobierze.
        const firstTrack = data.trackPoints?.[0];
        const firstWp = (data.waypoints || context.waypoints)?.[0];
        if (firstTrack && firstWp?.lat != null) {
          const dLat = Math.abs(firstTrack[0] - firstWp.lat);
          const dLng = Math.abs(firstTrack[1] - firstWp.lng);
          if (dLat > 0.5 || dLng > 0.5) {
            console.error('[GPX] Ślad nie zgadza się z punktami trasy', { firstTrack, firstWp });
            toast.error(
              `Plik GPX nie zgadza się z trasą (ślad zaczyna się w ${firstTrack[0].toFixed(2)}, ${firstTrack[1].toFixed(2)}, ` +
              `a trasa w ${firstWp.lat.toFixed(2)}, ${firstWp.lng.toFixed(2)}). Nie pobieraj tego pliku i zgłoś to.`,
              { duration: 20000 }
            );
          }
        }

        if (data.validation?.warnings?.length) {
          for (const warning of data.validation.warnings) {
            toast.warning(warning, { duration: 8000 });
          }
        } else {
          toast.success("Trasa przeliczona!");
        }
        
        return {
          geometry: data.geometry,
          waypoints: data.waypoints || context.waypoints,
          gpxData: finalGpx,
          guideText: context.guideText,
          title: context.title || 'Nowa Trasa'
        };
      }),
      saveProjectActor: fromPromise(async ({ input }: any) => {
        const { context } = input;
        
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("Brak użytkownika");

        let projectId = context.projectId;

        const reqs = {
            title: context.title || 'Nowa Trasa AI',
            chatMessages: context.chatMessages,
            waypoints: context.waypoints,
            geometry: context.geometry ? context.geometry.coordinates : null,
            gpxData: context.gpxData,
            guideText: context.guideText,
            vehicleType: context.vehicleType,
            bikeSubtype: context.bikeSubtype,
            // Bez tego wznowiony projekt otwierał się mapą: warstwa wywiadu nie
            // wiedziała, na którym etapie rozmowa została przerwana.
            phase: context.phase,
            tripProfile: context.tripProfile,
            distanceTargetKm: context.distanceTargetKm
        };

        if (!projectId) {
            const { data: project, error } = await (supabase as any).from('route_builder_projects')
            .insert({
                user_id: userData.user.id,
                requirements: reqs
            })
            .select()
            .single();
            if (error) throw error;
            projectId = project.id;
        } else {
            const { error } = await (supabase as any).from('route_builder_projects')
            .update({
                requirements: reqs,
                updated_at: new Date().toISOString()
            })
            .eq('id', projectId);
            if (error) throw error;
        }

        return { projectId };
      })
    }
  });
}, []);

const [state, send] = useMachine(machine, {
  input: {
    projectId: initialProjectId
  }
});

const context = state.context;

  const setField = useCallback((field: keyof WizardContext, value: any) => {
    send({ type: 'SET_FIELD', field, value });
  }, [send]);

  useEffect(() => {
    if (state.matches('error')) {
      // Konkret zamiast "wystąpił błąd": wygasła sesja, limit zapytań i padnięty
      // routing wymagają od użytkownika zupełnie różnych reakcji.
      toast.error(context.errorMessage || 'Nie udało się wykonać operacji.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.value]);

  /**
   * Ponowienie ostatniej operacji. Jeśli mamy komplet punktów, wracamy do
   * liczenia trasy; w przeciwnym razie powtarzamy ostatnią wypowiedź użytkownika,
   * bo to ona nie doczekała się odpowiedzi.
   */
  const retryLastAction = useCallback(() => {
    if (context.waypoints.length >= 2) {
      send({ type: 'CALCULATE_ROUTE' });
      return;
    }
    send({ type: 'RETRY' });
  }, [send, context.waypoints.length]);

  // Wybór karty: ustalenia z karty wchodzą do profilu wyjazdu, a jej tytuł leci
  // do agenta jako odpowiedź użytkownika — dzięki temu rozmowa czyta się naturalnie,
  // a backend dostaje twarde parametry zamiast domyślać się ich z tekstu.
  const chooseOption = useCallback((option: { title: string; implies?: Record<string, any> }) => {
    if (option.implies && Object.keys(option.implies).length > 0) {
      // Dystans z karty jest twardym parametrem, nie opisem — bez niego walidacja
      // mierzyła trasę względem innego celu niż ten pokazany użytkownikowi.
      const { distance_km, ...profileFields } = option.implies;
      if (typeof distance_km === 'number' && distance_km > 0) {
        send({ type: 'SET_FIELD', field: 'distanceTargetKm', value: distance_km });
      }
      if (Object.keys(profileFields).length > 0) {
        send({ type: 'SET_FIELD', field: 'tripProfile', value: { ...context.tripProfile, ...profileFields } });
      }
    }
    send({ type: 'SEND_MESSAGE', text: option.title });
  }, [send, context.tripProfile]);

  return {
    state,
    context,
    send,
    setField,
    chooseOption,
    retryLastAction
  };
}
