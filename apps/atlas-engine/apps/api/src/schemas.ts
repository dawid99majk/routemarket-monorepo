import { z } from "zod";
import { ProjectStatusSchema } from "@routemarket/atlas-core/src/index.js";

const SafeFileNameSchema = z.string()
  .min(1)
  .max(120)
  .refine(
    (name) => !name.startsWith(".") && !name.includes("..") && !name.includes("/") && !name.includes("\\"),
    { message: "Invalid file name. Cannot start with a dot or contain path segments." }
  );

export const DiscoverBodySchema = z.object({
  category: z.string().min(1),
  region: z.string().min(1),
  language: z.string().min(2).default("en"),
  limit: z.number().int().positive().max(50).default(10)
});

export const CreateProjectBodySchema = z.object({
  topic: z.string().min(1).max(200),
  category: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  language: z.string().min(2).default("en"),
  ownerUserId: z.string().optional()
});

export const EmptyBodySchema = z.object({}).passthrough();

export const CollectSourcesBodySchema = z.object({
  provider: z.enum(["auto", "mock", "google"]).default("auto"),
  limit: z.number().int().positive().max(50).optional()
});

export const DeepResearchBodySchema = z.object({
  sourceLimit: z.number().int().positive().max(20).default(3)
});

export const UpdateProjectStatusBodySchema = z.object({
  status: ProjectStatusSchema
});

export const SubmitReviewDecisionBodySchema = z.object({
  decision: z.enum(["approved", "changes_requested", "blocked"]),
  reviewer: z.string().min(1).max(100).optional(),
  notes: z.string().max(2000).optional()
});

export const SubmitStageApprovalBodySchema = z.object({
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  reviewer: z.string().min(1).max(100).optional(),
  notes: z.string().max(2000).optional()
});

export const WriteProjectFileBodySchema = z.object({
  content: z.string().max(1_000_000) // 1MB limit for generic file writes
});

export const JobApprovalBodySchema = z.object({
  approvalData: z.any().optional()
});

export const PruneJobsBodySchema = z.object({
  olderThanMs: z.number().int().nonnegative().optional()
});

export const ArchiveProjectBodySchema = z.object({
  reason: z.string().max(500).optional()
});

export const AddNoteBodySchema = z.object({
  fileName: SafeFileNameSchema.refine(
    (name) => /\.(md|txt|csv|json|geojson|kml|pdf|doc|docx)$/i.test(name),
    { message: "Allowed note/document types: .md, .txt, .csv, .json, .geojson, .kml, .pdf, .doc, .docx." }
  ),
  content: z.string().min(1).max(10_000_000), // service enforces tighter text limits and 10MB document limits
  note: z.string().max(500).optional()
});

export const AddGpxBodySchema = z.object({
  fileName: SafeFileNameSchema.refine((name) => name.endsWith(".gpx"), { message: "Only .gpx files are allowed." }),
  content: z.string().min(1).max(10_000_000), // 10MB limit for GPX
  note: z.string().max(500).optional()
});

export const AddLinkBodySchema = z.object({
  url: z.string().url().max(1000),
  note: z.string().max(500).optional()
});

export const RemoveInputBodySchema = z.object({
  id: z.string().min(1).max(200).optional(),
  path: z.string().min(1).max(1000).optional(),
  originalName: z.string().min(1).max(500).optional()
}).refine((value) => Boolean(value.id || value.path || value.originalName), {
  message: "id, path or originalName is required"
});

export const RegisterExternalInputBodySchema = z.object({
  type: z.enum(["note", "document", "photo", "gpx", "link"]),
  originalName: SafeFileNameSchema,
  storageUrl: z.string().url().max(2000).optional(),
  storageKey: z.string().min(1).max(500).optional(),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().nonnegative().max(100_000_000), // 100MB limit for external reference metadata
  note: z.string().max(500).optional()
}).refine((value) => Boolean(value.storageUrl || value.storageKey), {
  message: "storageUrl or storageKey is required"
});

export const InterviewBodySchema = z.object({
  context: z.record(z.string(), z.any()).optional(),
  answers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    q: z.string().optional()
  })).optional(),
  youtube_url: z.string().url().max(1000).optional()
});

export const MagicGenerateBodySchema = z.object({
  topic: z.string().min(1).max(200),
  region: z.string().min(1),
  category: z.string().min(1).optional(),
  notes: z.string().max(50000).optional(),
  preferences: z.record(z.string(), z.any()).optional()
});

export const GeometryRouteBodySchema = z.object({
  start: z.object({ lat: z.number(), lng: z.number() }),
  end: z.object({ lat: z.number(), lng: z.number() }),
  midpoint: z.object({ lat: z.number(), lng: z.number() }).optional(),
  targetDistanceKm: z.number().min(1).max(1000),
  category: z.string(),
  slug: z.string().optional()
});

export const ResearchBodySchema = z.object({
  slug: z.string(),
  intent: z.string().optional(),
  gpxUrl: z.string().url().optional()
});
