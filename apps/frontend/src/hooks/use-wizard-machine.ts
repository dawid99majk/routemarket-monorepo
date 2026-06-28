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
    /* @ts-ignore */
    actors: {
      chatActor: async ({ input }: any) => {
        const apiUrl = import.meta.env.VITE_API_URL || '/route-builder-api';
        const res = await fetch(`${apiUrl}/chat-interview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...input.context.chatMessages, { role: 'user', text: input.text }],
            project_id: input.context.projectId,
            input_notes: input.context.inputNotes,
            current_waypoints: input.context.waypoints,
            vehicle_type: input.context.vehicleType,
            bike_subtype: input.context.bikeSubtype,
            routing_preference: input.context.routingPreference
          })
        });
        if (!res.ok) throw new Error('Chat failed');
        const data = await res.json();
        return { message: data.message || data.text };
      },
      routeGeneratorActor: async ({ input }: any) => {
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
        
        const apiUrl = import.meta.env.VITE_API_URL || '/route-builder-api';
        const res = await fetch(`${apiUrl}/live-route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: context.waypoints,
            route_type: context.vehicleType === 'bicycle' ? context.bikeSubtype : context.vehicleType,
            intent: context.routingPreference
          })
        });

        if (!res.ok) throw new Error('Live route generation failed: ' + res.status);
        const data = await res.json();
        
        if (!data.geometry || !data.trackPoints) {
            throw new Error("Brak geometrii w odpowiedzi routingu.");
        }

        let finalGpx = generateGpxString(data.trackPoints, context.title || 'Nowa Trasa');
        
        toast.success("Trasa przeliczona!");
        
        return {
          geometry: data.geometry,
          waypoints: data.waypoints || context.waypoints,
          gpxData: finalGpx,
          guideText: context.guideText,
          title: context.title || 'Nowa Trasa'
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
