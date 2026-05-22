export type WorkflowStage =
  | "sources"
  | "research"
  | "claims_review"
  | "poi_review"
  | "concept_review"
  | "gpx_review"
  | "guide_outline"
  | "guide_final"
  | "media"
  | "publish";

export type ApprovalStage =
  | "claims_approval"
  | "poi_approval"
  | "concept_approval"
  | "guide_outline_approval"
  | "guide_final_approval";
