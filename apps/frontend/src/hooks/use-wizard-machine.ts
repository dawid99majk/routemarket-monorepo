import { useMachine } from '@xstate/react';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { wizardMachine, WizardContext } from '@routemarket/atlas-workflow/wizard-machine';

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
    const lat = coord[1];
    const lon = coord[0];
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

export function useWizardMachine(initialProjectId: string | null = null) {
  const [state, send] = useMachine(wizardMachine, {
    // Override machine actors with our actual logic
    actors: {
      chatActor: async ({ input }: any) => {
        const res = await fetch('/atlas/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...input.context.chatMessages, { role: 'user', content: input.text }],
            profile: input.context.vehicleType === 'bicycle' ? input.context.bikeSubtype : input.context.vehicleType,
            waypoints: input.context.waypoints
          })
        });
        if (!res.ok) throw new Error('Chat failed');
        const data = await res.json();
        return { message: data.message || data.text };
      },
      routeGeneratorActor: async ({ input }: any) => {
        const { context } = input;
        let messagesToUse = context.chatMessages;
        
        if (messagesToUse.length === 0) {
            let fallbackText = "Proszę wyznacz trasę na podstawie moich punktów.";
            if (context.inputNotes) fallbackText += ` Moje notatki: ${context.inputNotes}`;
            if (context.waypoints.length > 0) {
                fallbackText += ` Wyznaczam przez ${context.waypoints.length} punktów.`;
            }
            messagesToUse = [{ role: 'user', text: fallbackText }];
        }
        
        const res = await fetch('/atlas/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messagesToUse.map((m: any) => ({ role: m.role, content: m.text })),
            profile: context.vehicleType === 'bicycle' ? context.bikeSubtype : context.vehicleType
          })
        });

        if (!res.ok) throw new Error('Generation failed: ' + res.status);
        const data = await res.json();
        
        if (!data.trackPoints || data.trackPoints.length === 0) {
            throw new Error("Brak trackPoints w odpowiedzi AI.");
        }

        const mappedCoords = data.trackPoints.map((p: number[]) => [p[1], p[0], p[2] || 0]);
        const geometry = {
          type: 'LineString',
          coordinates: mappedCoords
        };

        let finalWaypoints = context.waypoints;
        if (data.points && Array.isArray(data.points) && data.points.length >= 2) {
          finalWaypoints = data.points.map((pt: any, i: number) => ({
            lat: pt.lat,
            lng: pt.lng,
            name: pt.name,
            type: i === 0 ? 'start' : (i === data.points.length - 1 ? 'end' : 'waypoint')
          }));
        }

        let finalGpx = data.gpx;
        if (!finalGpx) {
          finalGpx = generateGpxString(mappedCoords, data.title || 'Nowa Trasa AI');
        }

        toast.success("Trasa wygenerowana pomyślnie!");
        
        return {
          geometry,
          waypoints: finalWaypoints,
          gpxData: finalGpx,
          guideText: data.guide,
          title: data.title
        };
      },
      saveProjectActor: async ({ input }: any) => {
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
            bikeSubtype: context.bikeSubtype
        };

        if (!projectId) {
            const { data: project, error } = await supabase
            .from('route_builder_projects')
            .insert({
                user_id: userData.user.id,
                requirements: reqs
            })
            .select()
            .single();
            if (error) throw error;
            projectId = project.id;
        } else {
            const { error } = await supabase
            .from('route_builder_projects')
            .update({
                requirements: reqs,
                updated_at: new Date().toISOString()
            })
            .eq('id', projectId);
            if (error) throw error;
        }

        return { projectId };
      }
    }
  });

  const context = state.context;

  const setField = useCallback((field: keyof WizardContext, value: any) => {
    send({ type: 'SET_FIELD', field, value });
  }, [send]);

  useEffect(() => {
    if (state.matches('error')) {
       toast.error("Wystąpił błąd w procesie AI. Możesz spróbować ponownie.");
    }
  }, [state.value]);

  return { 
    state,
    context, 
    send, 
    setField
  };
}
