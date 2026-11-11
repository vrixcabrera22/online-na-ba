// Types for the Supabase schema in supabase/migrations.
// Hand-written to match 20261111000001_init.sql. Once the project is linked,
// regenerate with:
//   npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts

export type CheckStatus = "up" | "slow" | "down";
export type PlanType = "free" | "pro";
export type Locale = "fil" | "en";
export type MonitorCategory = "benefits" | "ids" | "tax" | "others";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          plan: PlanType;
          preferred_locale: Locale;
          created_at: string;
        };
        Insert: never; // created by the sign-up trigger
        Update: { preferred_locale?: Locale };
        Relationships: [];
      };
      monitors: {
        Row: {
          id: string;
          slug: string | null;
          name: string;
          url: string;
          category: MonitorCategory | null;
          is_public: boolean;
          owner_id: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug?: string | null;
          name: string;
          url: string;
          category?: MonitorCategory | null;
          is_public?: boolean;
          owner_id?: string | null;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: {
          name?: string;
          url?: string;
          is_active?: boolean;
          slug?: string | null;
          category?: MonitorCategory | null;
          is_public?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      checks: {
        Row: {
          id: number;
          monitor_id: string;
          status: CheckStatus;
          status_code: number | null;
          response_time_ms: number | null;
          error: string | null;
          checked_at: string;
        };
        Insert: {
          monitor_id: string;
          status: CheckStatus;
          status_code?: number | null;
          response_time_ms?: number | null;
          error?: string | null;
          checked_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      hourly_stats: {
        Row: {
          monitor_id: string;
          hour: string;
          total: number;
          up_count: number;
          slow_count: number;
          down_count: number;
          avg_response_ms: number | null;
        };
        Insert: {
          monitor_id: string;
          hour: string;
          total?: number;
          up_count?: number;
          slow_count?: number;
          down_count?: number;
          avg_response_ms?: number | null;
        };
        Update: {
          total?: number;
          up_count?: number;
          slow_count?: number;
          down_count?: number;
          avg_response_ms?: number | null;
        };
        Relationships: [];
      };
      incidents: {
        Row: {
          id: number;
          monitor_id: string;
          started_at: string;
          ended_at: string | null;
          duration_seconds: number | null;
        };
        Insert: {
          monitor_id: string;
          started_at: string;
          ended_at?: string | null;
        };
        Update: { ended_at?: string | null };
        Relationships: [];
      };
      alert_settings: {
        Row: {
          id: string;
          user_id: string;
          monitor_id: string;
          email: string;
          enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          monitor_id: string;
          email: string;
          enabled?: boolean;
        };
        Update: { email?: string; enabled?: boolean };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      check_status: CheckStatus;
      plan_type: PlanType;
    };
    CompositeTypes: Record<string, never>;
  };
}
