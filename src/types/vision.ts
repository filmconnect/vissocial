// ============================================================
// VISSOCIAL - New Database Types
// ============================================================
// Add these types to your existing types file or create new one
// Path suggestion: src/types/vision.ts
// ============================================================

// ============================================================
// Vision Analysis Types
// ============================================================

export interface VisionAnalysisResult {
  visual_style: {
    dominant_colors: string[];      // Hex codes: ["#E8B4A0", "#2C3E50"]
    photography_style: string;       // "lifestyle" | "studio" | "flat_lay" | "product_focus"
    lighting: string;                // "natural" | "studio" | "golden_hour" | "soft"
    mood: string;                    // "cozy" | "professional" | "playful" | "minimal"
    composition_patterns: string[];  // ["rule_of_thirds", "centered", "symmetrical"]
  };
  products: Array<{
    name: string;
    category: string;
    visual_features: string[];
    prominence: "high" | "medium" | "low";
    confidence: number; // 0-1
  }>;
  brand_elements: {
    logo_visible: boolean;
    brand_colors_present: boolean;
    text_overlay: string | null;
  };
  technical_quality?: {
    resolution: string;
    sharpness: string;
    composition_score: number;
  };
}

export interface InstagramAnalysis {
  id: string;
  asset_id: string;
  analysis: VisionAnalysisResult;
  model_version: string;
  tokens_used?: number;
  analyzed_at: Date;
}

// ============================================================
// Detected Products Types
// ============================================================

export type DetectedProductStatus = "pending" | "confirmed" | "rejected";
export type ProductProminence = "high" | "medium" | "low";

export interface DetectedProduct {
  id: string;
  project_id: string;
  asset_id: string;
  product_name: string;
  category: string | null;
  visual_features: string[] | null;
  prominence: ProductProminence | null;
  confidence: number | null;
  frequency: number;
  first_seen_at: Date;
  last_seen_at: Date;
  status: DetectedProductStatus;
}

// Summary view type
export interface DetectedProductSummary {
  project_id: string;
  product_name: string;
  category: string | null;
  detection_count: number;
  max_confidence: number;
  avg_confidence: number;
  first_seen: Date;
  last_seen: Date;
  asset_ids: string[];
}

// ============================================================
// Brand Rebuild Events Types
// ============================================================

export type RebuildTriggerType = 
  | "instagram_ingest"
  | "analysis_complete"
  | "product_confirmed"
  | "product_rejected"
  | "manual_update"
  | "onboarding_complete"
  | "reference_uploaded";

export type RebuildStatus = 
  | "pending"
  | "analyzing"
  | "ready"
  | "rebuilding"
  | "completed"
  | "failed"
  | "skipped";

export interface BrandRebuildEvent {
  id: string;
  project_id: string;
  trigger_type: RebuildTriggerType;
  status: RebuildStatus;
  total_expected: number;
  analyses_completed: number;
  metadata: {
    products_before?: number;
    products_after?: number;
    colors_changed?: boolean;
    duration_ms?: number;
    [key: string]: any;
  };
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

// ============================================================
// Brand Profile Types (Enhanced)
// ============================================================

export interface BrandProfileMetadata {
  confidence_level: "auto" | "manual" | "hybrid";
  based_on_posts: number;
  last_manual_override: string | null;
  auto_generated_at: string;
  version: number;
}

export interface BrandProfile {
  _metadata: BrandProfileMetadata;
  
  visual_style: {
    dominant_colors: string[];
    photography_styles: string[];
    lighting_preferences: string[];
    mood: string;
    composition_patterns: string[];
  };
  
  products: Array<{
    id: string;
    name: string;
    category: string;
    frequency: number;
    visual_features: string[];
    locked: boolean;
  }>;
  
  content_themes: string[];
  
  caption_patterns: {
    average_length: number;
    tone: string;
    emoji_usage: boolean;
    hashtag_avg: number;
    cta_frequency: number;
  };
  
  brand_consistency: {
    color_consistency_score: number;
    style_consistency_score: number;
    overall_aesthetic: string;
  };
}

// ============================================================
// System State Types (for state-aware chat)
// ============================================================

export interface SystemState {
  ig_connected: boolean;
  media_ingested: boolean;
  media_count: number;
  analyses_completed: number;
  analyses_pending: number;
  brand_profile_ready: boolean;
  pending_products: number;  // Detected but not confirmed
  confirmed_products: number;
  pending_jobs: string[];
  last_rebuild_at: Date | null;
  rebuild_in_progress: boolean;
}

// ============================================================
// Chat Chip Types (for clickable chips)
// ============================================================

export type ChipType = 
  | "suggestion"
  | "onboarding_option"
  | "product_confirm"
  | "navigation";

export interface ChatChip {
  type: ChipType;
  label: string;
  value?: string;         // For suggestion, onboarding_option
  step?: string;          // For onboarding_option (goal, planned_posts, etc.)
  href?: string;          // For navigation
  productId?: string;     // For product_confirm
  action?: "confirm" | "reject";  // For product_confirm
}

export interface ChatMessage {
  id: string;
  role: "assistant" | "user" | "system";
  text: string;
  chips?: ChatChip[];
  meta?: Record<string, any>;
  created_at: Date;
}

// ============================================================
// API Response Types
// ============================================================

export interface ChatMessageResponse {
  new_messages: ChatMessage[];
  action_executed?: boolean;
  system_state?: SystemState;
}

export interface ProfileResponse {
  brand_profile: BrandProfile | null;
  pending_products: DetectedProductSummary[];
  confirmed_products: Array<{
    id: string;
    name: string;
    category: string;
    confidence: number;
    locked: boolean;
  }>;
  reference_assets: Array<{
    id: string;
    url: string;
    label: string;
    created_at: Date;
  }>;
}
