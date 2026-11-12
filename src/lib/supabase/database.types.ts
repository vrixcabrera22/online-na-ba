// Types for the Supabase schema in supabase/migrations.
// Hand-written to match 20261111000001_init.sql. Once the project is linked,
// regenerate with:
//   npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts

export type CheckStatus = "up" | "slow" | "down";
export type PlanType = "free" | "pro";
export type Locale = "fil" | "en";
export type MonitorCategory = "benefits" | "ids" | "tax" | "others";

export type ResponseTimeRange = "24h" | "7d";

/** One row of status_board(). Uptime values are percentages (0–100), null when no checks yet. */
export interface StatusBoardRow {
  id: string;
  slug: string;
  name: string;
  url: string;
  category: MonitorCategory;
  sort_order: number;
  last_status: CheckStatus | null;
  last_status_code: number | null;
  last_response_ms: number | null;
  last_checked_at: string | null;
  uptime_24h: number | null;
  uptime_7d: number | null;
  uptime_30d: number | null;
}

/** One row of my_monitors(): a personal monitor with its latest check. */
export interface MyMonitorRow {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  created_at: string;
  last_status: CheckStatus | null;
  last_status_code: number | null;
  last_response_ms: number | null;
  last_checked_at: string | null;
  uptime_24h: number | null;
  uptime_7d: number | null;
  uptime_30d: number | null;
}

/** One point of response_times(). */
export interface ResponseTimePoint {
  bucket: string;
  avg_response_ms: number | null;
  total: number;
  down: number;
}

export type AlertKind = "down" | "up";

/** One row of pending_alerts(): an email that should be sent now. */
export interface PendingAlert {
  kind: AlertKind;
  incident_id: number;
  monitor_id: string;
  monitor_name: string;
  monitor_url: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  last_error: string | null;
  alert_setting_id: string;
  recipient: string;
  locale: Locale;
}

/** Input row for record_checks(). */
export interface CheckInput {
  monitor_id: string;
  status: CheckStatus;
  status_code: number | null;
  response_time_ms: number | null;
  error: string | null;
  checked_at: string;
}

/** An incident opened or closed by record_checks(). */
export interface IncidentEvent {
  event: "opened" | "closed";
  incident_id: number;
  monitor_id: string;
  started_at: string;
  ended_at: string | null;
}

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
          down_alert_sent_at: string | null;
          up_alert_sent_at: string | null;
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
    Functions: {
      status_board: {
        Args: { p_slug?: string };
        Returns: StatusBoardRow[];
      };
      response_times: {
        Args: { p_monitor_id: string; p_range?: ResponseTimeRange };
        Returns: ResponseTimePoint[];
      };
      my_monitors: {
        Args: { p_id?: string };
        Returns: MyMonitorRow[];
      };
      pending_alerts: {
        Args: Record<string, never>;
        Returns: PendingAlert[];
      };
      mark_alerts_sent: {
        Args: { p_sent: { incident_id: number; kind: AlertKind }[] };
        Returns: number;
      };
      record_checks: {
        Args: { p_checks: CheckInput[] };
        Returns: IncidentEvent[];
      };
    };
    Enums: {
      check_status: CheckStatus;
      plan_type: PlanType;
    };
    CompositeTypes: Record<string, never>;
  };
}
