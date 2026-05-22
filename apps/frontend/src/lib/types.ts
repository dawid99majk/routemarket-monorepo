export interface RouteItem {
  id: number;
  title: string;
  description: string;
  price: number;
  category_id: number;
  category_name: string;
  creator_name: string;
  cover_image_key: string;
  gpx_file_key?: string;
  pdf_file_key?: string;
  location_string: string;
  latitude: number;
  longitude: number;
  distance_km: number | null;
  elevation_gain_m: number | null;
  estimated_time_h: number | null;
  difficulty: string | null;
  surface_type: string | null;
  season: string | null;
  loop_type: string | null;
  start_point?: string | null;
  end_point?: string | null;
  created_at: string;
  user_id?: string;
  ai_assisted?: boolean;
  ai_assisted_scope?: string | null;
  last_verified_at?: string | null;
  risk_level?: string | null;
  known_hazards?: string[];
  required_equipment?: string[];
  data_confidence?: string | null;
}

export interface BuyerRiskAcknowledgement {
  id: string;
  user_id: string;
  route_id: number;
  acknowledgement_version: string;
  acknowledged_at: string;
  risk_level: string | null;
  declarations: Record<string, boolean>;
  user_agent: string | null;
  ip_hash: string | null;
}

export interface LegalDocument {
  id: string;
  doc_type: string;
  version: string;
  content_hash: string;
  published_at: string;
  title: string | null;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  sort_order: number;
}

export interface RouteStats {
  average_rating: number;
  total_ratings: number;
  total_purchases: number;
}

export interface Purchase {
  id: number;
  route_id: number;
  amount_paid: number;
  purchased_at: string;
}

export interface CreatorProfile {
  id: number;
  display_name: string;
  bio: string;
  stripe_connect_account_id: string;
  total_earnings: number;
  total_sales: number;
}

export interface CommentItem {
  id: number;
  author_name: string;
  content: string;
  created_at: string | null;
}

export interface ReviewSummary {
  average_rating: number;
  total_ratings: number;
}

export type UserRole = 'user' | 'creator' | 'admin';

export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
}
