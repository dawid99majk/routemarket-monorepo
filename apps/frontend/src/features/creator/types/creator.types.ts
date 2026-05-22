import { WorkflowStage, ApprovalStage } from '@routemarket/shared-workflow';

export type PipelineStep = 'sources' | 'interview' | 'outline' | 'gpx' | 'guide' | 'media' | 'publish';
export type ApprovalState = 'pending' | 'approved';

export interface SourceFile {
  name: string;
  size: number;
}

export interface Project {
  id: string;
  title: string;
  category: string;
  region: string;
  language: string;
  status: string;
  waitingApprovalStage?: string;
  folderPath?: string;
  [key: string]: unknown;
}

export interface EventLog {
  type?: string;
  message: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface Route {
  id: number;
  title: string;
  status: string;
}

export interface PoiFeature {
  type: string;
  properties?: {
    id?: string;
    name?: string;
    description?: string;
    type?: string;
    status?: string;
    [key: string]: any;
  };
  geometry?: {
    type: "Point";
    coordinates: [number, number];
  };
}

export interface PoiGeoJson {
  type: "FeatureCollection";
  features: PoiFeature[];
}

export interface RouteSummary {
  distanceKm?: number;
  elevationGainM?: number;
  estimatedTimeH?: number;
  difficulty?: string;
  [key: string]: any;
}
