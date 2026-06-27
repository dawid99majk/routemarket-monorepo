import { setup, assign, fromPromise } from 'xstate';

export interface ChatMessage {
  role: 'agent' | 'user';
  text: string;
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

  // Builder state
  chatMessages: ChatMessage[];
  inputNotes: string;
  vehicleType: 'motorcycle' | 'bicycle' | 'hiking' | 'city' | 'car';
  bikeSubtype: 'gravel' | 'road' | 'mtb';
  waypoints: Waypoint[];
  geometry: any | null;
  gpxData: string | null;
  guideText: string | null;
  
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
  | { type: 'CALCULATE_ROUTE' }
  | { type: 'SAVE_PROJECT' }
  | { type: 'PUBLISH' };

export const initialWizardContext: WizardContext = {
  projectId: null,
  userId: null,
  chatMessages: [],
  inputNotes: '',
  vehicleType: 'bicycle',
  bikeSubtype: 'gravel',
  waypoints: [],
  geometry: null,
  gpxData: null,
  guideText: null,
  routeStats: { distance: 0, ascent: 0, descent: 0 },

  title: 'Nowa Trasa AI',
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
          return [...context.chatMessages, { role: 'user', text: event.text }];
        }
        return context.chatMessages;
      }
    }),
    appendAgentResponse: assign({
      chatMessages: ({ context, event }) => {
        // @ts-ignore
        if (event.output && event.output.message) {
           // @ts-ignore
           return [...context.chatMessages, { role: 'agent', text: event.output.message }];
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
          waypoints: output.waypoints,
          gpxData: output.gpxData,
          guideText: output.guideText,
        };
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
    })
  }
}).createMachine({
  id: 'wizard',
  initial: 'idle',
  context: initialWizardContext,
  states: {
    idle: {
      on: {
        SET_FIELD: { actions: 'assignField' },
        CLEAR_ROUTE: { actions: 'clearRoute' },
        SEND_MESSAGE: {
          target: 'chatting',
          actions: 'appendMessage'
        },
        CALCULATE_ROUTE: {
          target: 'generating_route'
        },
        SAVE_PROJECT: {
          target: 'saving_project'
        }
      }
    },
    chatting: {
      invoke: {
        src: 'chatActor',
        input: ({ context, event }) => ({ context, text: event.type === 'SEND_MESSAGE' ? event.text : '' }),
        onDone: {
          target: 'idle',
          actions: 'appendAgentResponse'
        },
        onError: {
          target: 'error'
        }
      }
    },
    generating_route: {
      invoke: {
        src: 'routeGeneratorActor',
        input: ({ context }) => ({ context }),
        onDone: {
          target: 'saving_project', // Automatically save after generating
          actions: 'assignGeneratedRoute'
        },
        onError: {
          target: 'error'
        }
      }
    },
    saving_project: {
      invoke: {
        src: 'saveProjectActor',
        input: ({ context }) => ({ context }),
        onDone: {
          target: 'idle',
          actions: 'assignProjectDetails'
        },
        onError: {
          target: 'error'
        }
      }
    },
    error: {
      on: {
        SEND_MESSAGE: { target: 'chatting', actions: 'appendMessage' },
        CALCULATE_ROUTE: { target: 'generating_route' },
        SET_FIELD: { actions: 'assignField' }
      }
    }
  }
});
