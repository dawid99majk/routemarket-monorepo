import { setup, assign, fromPromise } from 'xstate';

export interface RouteOption {
  id: string;
  title: string;
  titleTouched?: boolean;
  subtitle?: string;
  description?: string;
  highlights?: string[];
  /** Karta otwiera pole tekstowe zamiast od razu wysyłać swój tytuł. */
  requiresInput?: boolean;
  inputPlaceholder?: string;
  /** Ustalenia, które wybór tej karty wnosi do profilu wyjazdu (np. structure, region). */
  implies?: Record<string, any>;
}

export interface ChatMessage {
  role: 'agent' | 'user';
  text: string;
  options?: RouteOption[];
  allowCustom?: boolean;
  phase?: string;
}

export interface Waypoint {
  lat: number;
  lng: number;
  type: string;
  name?: string;
}

export interface WizardContext {
  projectId: string | null;
  userId: string | null;
  retries: number;

  // Builder state
  chatMessages: ChatMessage[];
  inputNotes: string;
  vehicleType: 'motorcycle' | 'bicycle' | 'hiking' | 'city' | 'car';
  bikeSubtype: 'gravel' | 'road' | 'mtb';
  waypoints: Waypoint[];
  geometry: any | null;
  gpxData: string | null;
  guideText: string | null;
  routingPreference: 'popular' | 'wild';
  distanceTargetKm: number | null;
  /** Decyzje podjęte kliknięciem kart wyboru — sterują geometrią generowanej trasy. */
  tripProfile: Record<string, any>;
  /** Aktualny etap wywiadu — steruje paskiem kroków w warstwie wywiadu. */
  phase: string | null;
  /** Treść ostatniego błędu. Bez niej stan error był niemy i wyglądał jak zawieszenie. */
  errorMessage: string | null;

  // Stats
  routeStats: {
    distance: number;
    ascent: number;
    descent: number;
  };

  // Additional old wizard fields for compatibility
  title: string;
  description: string;
  price: string;
  isFree: boolean;
  currency: string;
  categoryId: string;
  locationString: string;
  latitude: number;
  longitude: number;
}

export type WizardEvent =
  | { type: 'SET_FIELD'; field: keyof WizardContext; value: any }
  | { type: 'ADD_WAYPOINT'; waypoint: Waypoint; index?: number }
  | { type: 'REMOVE_WAYPOINT'; index: number }
  | { type: 'UPDATE_WAYPOINT'; index: number; waypoint: Waypoint }
  | { type: 'CLEAR_ROUTE' }
  | { type: 'SEND_MESSAGE'; text: string }
  | { type: 'RETRY' }
  | { type: 'REWIND_TO_PHASE'; phase: string }
  | { type: 'CALCULATE_ROUTE' }
  | { type: 'SAVE_PROJECT' }
  | { type: 'PUBLISH' };

export const initialWizardContext: WizardContext = {
  projectId: null,
  userId: null,
  retries: 0,
  chatMessages: [],
  inputNotes: '',
  vehicleType: 'bicycle',
  bikeSubtype: 'gravel',
  waypoints: [],
  geometry: null,
  gpxData: null,
  guideText: null,
  routingPreference: 'popular',
  distanceTargetKm: null,
  tripProfile: {},
  phase: null,
  errorMessage: null,
  routeStats: { distance: 0, ascent: 0, descent: 0 },

  title: 'Nowa Trasa AI',
  /** Ustawiane, gdy użytkownik sam poprawi nazwę — od tej chwili agent jej nie rusza. */
  titleTouched: false,
  description: '',
  price: '',
  isFree: true,
  currency: 'PLN',
  categoryId: '',
  locationString: '',
  latitude: 0,
  longitude: 0,
};

export const wizardMachine = setup({
  types: {
    context: {} as WizardContext,
    events: {} as WizardEvent,
    input: {} as { projectId?: string | null }
  },
  actors: {
    chatActor: fromPromise(async ({ input }: { input: { context: WizardContext, text: string, chatCallback?: any } }) => {
      if (input.chatCallback) {
         return await input.chatCallback(input.context, input.text);
      }
      throw new Error("chatActor not implemented");
    }),
    routeGeneratorActor: fromPromise(async ({ input }: { input: { context: WizardContext, generateCallback?: any } }) => {
      if (input.generateCallback) {
         return await input.generateCallback(input.context);
      }
      throw new Error("routeGeneratorActor not implemented");
    }),
    saveProjectActor: fromPromise(async ({ input }: { input: { context: WizardContext, saveCallback?: any } }) => {
      if (input.saveCallback) {
         return await input.saveCallback(input.context);
      }
      throw new Error("saveProjectActor not implemented");
    })
  },
  actions: {
    assignField: assign(({ event }) => {
      if (event.type === 'SET_FIELD') {
        return { [event.field]: event.value };
      }
      return {};
    }),
    appendMessage: assign({
      chatMessages: ({ context, event }) => {
        if (event.type === 'SEND_MESSAGE') {
          return [...context.chatMessages, { role: 'user' as const, text: event.text }];
        }
        return context.chatMessages;
      }
    }),
    rewindToPhase: assign(({ context, event }) => {
      if (event.type !== 'REWIND_TO_PHASE') return {};
      // Cofamy rozmowę do pytania z danego etapu: zostawiamy je jako ostatnie,
      // żeby jego karty znów były aktywne, i zapominamy decyzje podjęte później.
      const idx = context.chatMessages.findIndex(
        (m) => m.role === 'agent' && m.phase === event.phase
      );
      if (idx < 0) return {};
      const ORDER = ['start_point', 'discovery', 'variant_choice', 'refine', 'confirm'];
      const keysByPhase: Record<string, string[]> = {
        start_point: ['start_point'],
        discovery: ['structure'],
        variant_choice: ['region', 'difficulty', 'pattern', 'variant'],
        refine: ['accommodation', 'pace', 'interests']
      };
      const cutFrom = ORDER.indexOf(event.phase);
      const profile = { ...context.tripProfile };
      ORDER.slice(cutFrom).forEach((ph) => (keysByPhase[ph] || []).forEach((k) => delete profile[k]));
      return {
        chatMessages: context.chatMessages.slice(0, idx + 1),
        tripProfile: profile,
        phase: event.phase,
        // Trasa wyliczona na porzuconych ustaleniach przestaje obowiązywać
        waypoints: [],
        geometry: null,
        gpxData: null
      };
    }),
    assignError: assign({
      errorMessage: ({ event }) => {
        // @ts-ignore — xstate nie typuje pola error w zdarzeniu onError
        const err = event.error;
        return (err && err.message) || 'Nie udało się wykonać operacji.';
      }
    }),
    clearError: assign({ errorMessage: null }),
    assignPhase: assign({
      phase: ({ context, event }) => {
        // @ts-ignore
        return event.output?.phase ?? context.phase;
      }
    }),
    appendAgentResponse: assign({
      chatMessages: ({ context, event }) => {
        // @ts-ignore
        const output = event.output;
        if (output && output.message) {
          const message: ChatMessage = { role: 'agent', text: output.message, phase: output.phase };
          if (Array.isArray(output.options) && output.options.length > 0) {
            message.options = output.options.map((o: any) => ({
              ...o,
              requiresInput: o.requires_input ?? o.requiresInput,
              inputPlaceholder: o.input_placeholder ?? o.inputPlaceholder
            }));
            message.allowCustom = output.allow_custom !== false;
          }
          return [...context.chatMessages, message];
        }
        return context.chatMessages;
      }
    }),
    assignGeneratedRoute: assign(({ context, event }) => {
      // @ts-ignore
      const output = event.output;
      if (output) {
        return {
          geometry: output.geometry,
          // Do NOT update waypoints here — they are the user's map pins and
          // replacing them with the router's snapped points would cause the
          // useEffect watcher in RouteBuilderV2 to trigger another recalculation (infinite loop).
          gpxData: output.gpxData,
          guideText: output.guideText,
        };
      }
      return {};
    }),
    assignSuggestedTitle: assign(({ context, event }) => {
      // @ts-ignore
      const suggested = event.output?.suggested_title;
      // Nazwa idzie od agenta tylko dopóki użytkownik jej nie przejął — inaczej
      // każda kolejna tura kasowałaby to, co wpisał.
      if (typeof suggested === 'string' && suggested.trim() && !context.titleTouched) {
        return { title: suggested.trim() };
      }
      return {};
    }),
    assignSuggestedWaypoints: assign(({ context, event }) => {
      // @ts-ignore
      const output = event.output;
      if (output && output.suggested_waypoints && output.suggested_waypoints.length >= 2) {
        // Zmień typ pierwszego na 'start', ostatniego na 'end', reszta 'waypoint'
        const wps = output.suggested_waypoints.map((wp: any, i: number) => ({
          ...wp,
          type: i === 0 ? 'start' : (i === output.suggested_waypoints.length - 1 ? 'end' : 'waypoint')
        }));
        // Cel dystansu jest potrzebny przy przeliczaniu trasy, żeby backend mógł
        // sprawdzić, czy wynik odpowiada temu, co obiecano użytkownikowi.
        return output.distance_target_km
          ? { waypoints: wps, distanceTargetKm: output.distance_target_km }
          : { waypoints: wps };
      }
      return {};
    }),
    assignProjectDetails: assign(({ context, event }) => {
       // @ts-ignore
       if (event.output && event.output.projectId) {
           // @ts-ignore
           return { projectId: event.output.projectId };
       }
       return {};
    }),
    clearRoute: assign({
      waypoints: [],
      geometry: null,
      gpxData: null,
      guideText: null,
      projectId: null
    }),
    incrementRetries: assign({
      retries: ({ context }) => context.retries + 1
    }),
    resetRetries: assign({
      retries: 0
    }),
    addWaypoint: assign({
      waypoints: ({ context, event }) => {
        if (event.type === 'ADD_WAYPOINT') {
          const newWps = [...context.waypoints];
          if (event.index !== undefined) {
            newWps.splice(event.index, 0, event.waypoint);
          } else {
            newWps.push(event.waypoint);
          }
          return newWps;
        }
        return context.waypoints;
      }
    }),
    removeWaypoint: assign({
      waypoints: ({ context, event }) => {
        if (event.type === 'REMOVE_WAYPOINT') {
          return context.waypoints.filter((_, idx) => idx !== event.index);
        }
        return context.waypoints;
      }
    }),
    updateWaypoint: assign({
      waypoints: ({ context, event }) => {
        if (event.type === 'UPDATE_WAYPOINT') {
          return context.waypoints.map((wp, idx) => idx === event.index ? { ...wp, ...event.waypoint } : wp);
        }
        return context.waypoints;
      }
    })
  }
}).createMachine({
  id: 'wizard',
  initial: 'idle',
  context: ({ input }) => ({
    ...initialWizardContext,
    projectId: input?.projectId || null
  }),
  states: {
    idle: {
      on: {
        REWIND_TO_PHASE: { actions: 'rewindToPhase' },
        SET_FIELD: { actions: 'assignField' },
        CLEAR_ROUTE: { actions: 'clearRoute' },
        ADD_WAYPOINT: { actions: 'addWaypoint' },
        REMOVE_WAYPOINT: { actions: 'removeWaypoint' },
        UPDATE_WAYPOINT: { actions: 'updateWaypoint' },
        SEND_MESSAGE: {
          target: 'chatting',
          actions: ['appendMessage', 'resetRetries', 'clearError']
        },
        CALCULATE_ROUTE: {
          target: 'generating_route',
          actions: ['resetRetries', 'clearError']
        },
        SAVE_PROJECT: {
          target: 'saving_project',
          actions: ['resetRetries', 'clearError']
        }
      }
    },
    chatting: {
      // Kliknięcie karty w trakcie odpowiedzi agenta było cicho porzucane przez
      // xstate i wyglądało jak zawieszenie — nowa wiadomość zastępuje bieżące zapytanie.
      on: {
        SEND_MESSAGE: { target: 'chatting', reenter: true, actions: ['appendMessage', 'resetRetries', 'clearError'] },
        SET_FIELD: { actions: 'assignField' }
      },
      invoke: {
        src: 'chatActor',
        input: ({ context, event }) => ({ context, text: event.type === 'SEND_MESSAGE' ? event.text : '' }),
        onDone: [
          {
            target: 'generating_route',
            // @ts-ignore
            guard: ({ event }) => event.output && event.output.done === true,
            actions: ['appendAgentResponse', 'assignPhase', 'assignSuggestedTitle', 'assignSuggestedWaypoints', 'resetRetries']
          },
          {
            target: 'idle',
            // Nazwa musi się aktualizować w TRAKCIE wywiadu, nie dopiero przy
            // generowaniu trasy — to wtedy użytkownik patrzy na pole z nazwą.
            actions: ['appendAgentResponse', 'assignPhase', 'assignSuggestedTitle', 'resetRetries']
          }
        ],
        onError: [
          {
            guard: ({ context }) => context.retries < 2,
            target: 'chatting',
            actions: 'incrementRetries'
          },
          {
            target: 'error',
            actions: 'assignError'
          }
        ]
      }
    },
    generating_route: {
      // Bez tego zdarzenie jest cicho porzucane przez xstate: użytkownik pisze
      // "zmień trasę" w trakcie liczenia, wiadomość znika i wygląda to na zawieszenie.
      on: {
        SEND_MESSAGE: { target: 'chatting', actions: ['appendMessage', 'resetRetries', 'clearError'] },
        SET_FIELD: { actions: 'assignField' }
      },
      invoke: {
        src: 'routeGeneratorActor',
        input: ({ context }) => ({ context }),
        onDone: {
          target: 'saving_project', // Automatically save after generating
          actions: ['assignGeneratedRoute', 'resetRetries']
        },
        onError: [
          {
            guard: ({ context }) => context.retries < 2,
            target: 'generating_route',
            actions: 'incrementRetries'
          },
          {
            target: 'error',
            actions: 'assignError'
          }
        ]
      }
    },
    saving_project: {
      // Zapis jest upsertem, więc przerwanie go nową wiadomością nic nie psuje —
      // kolejny zapis i tak utrwali stan projektu.
      on: {
        SEND_MESSAGE: { target: 'chatting', actions: ['appendMessage', 'resetRetries', 'clearError'] },
        SET_FIELD: { actions: 'assignField' }
      },
      invoke: {
        src: 'saveProjectActor',
        input: ({ context }) => ({ context }),
        onDone: {
          target: 'idle',
          actions: ['assignProjectDetails', 'resetRetries']
        },
        onError: [
          {
            guard: ({ context }) => context.retries < 2,
            target: 'saving_project',
            actions: 'incrementRetries'
          },
          {
            target: 'error',
            actions: 'assignError'
          }
        ]
      }
    },
    error: {
      on: {
        RETRY: { target: 'chatting', actions: ['resetRetries', 'clearError'] },
        REWIND_TO_PHASE: { actions: 'rewindToPhase' },
        SEND_MESSAGE: { target: 'chatting', actions: ['appendMessage', 'resetRetries', 'clearError'] },
        CALCULATE_ROUTE: { target: 'generating_route', actions: ['resetRetries', 'clearError'] },
        SET_FIELD: { actions: 'assignField' },
        ADD_WAYPOINT: { actions: 'addWaypoint' },
        REMOVE_WAYPOINT: { actions: 'removeWaypoint' },
        UPDATE_WAYPOINT: { actions: 'updateWaypoint' },
        CLEAR_ROUTE: { actions: 'clearRoute' }
      }
    }
  }
});
