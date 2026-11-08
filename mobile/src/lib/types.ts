// Subset of the Pulse 6.x unified resource API that this app reads.
// Source of truth: rcourtman/Pulse internal/unifiedresources/types.go

export type HealthVerdict = 'ok' | 'attention' | 'critical' | 'stale' | 'off' | 'unknown';

export interface MetricValue {
  value: number;
  percent?: number;
  used?: number;
  total?: number;
  unit?: string;
}

export interface Resource {
  id: string;
  type: string;
  technology?: string;
  name: string;
  status: string;
  lastSeen?: string;
  uptime?: number;
  temperature?: number;
  parentId?: string;
  parentName?: string;
  tags?: string[];
  customUrl?: string;
  health?: { verdict: HealthVerdict; reasons: { code: string; detail?: string }[] };
  metrics?: { cpu?: MetricValue; memory?: MetricValue; disk?: MetricValue };
  metricsTarget?: { resourceType: string; resourceId: string };
  proxmox?: {
    vmid?: number;
    nodeName?: string;
    instance?: string;
    cpus?: number;
    lastBackup?: string;
    uptime?: number;
    host?: string; // PVE API/web URL (set on node resources)
    backupInProgress?: boolean;
    pveVersion?: string;
    kernelVersion?: string;
    osName?: string;
    osVersion?: string;
    guestUrl?: string;
    lock?: string;
    temperature?: number;
  };
  agent?: { temperature?: number };
  storage?: { type?: string; shared?: boolean };
}

export interface ResourcesResponse {
  data: Resource[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface Alert {
  id: string;
  type: string;
  level: 'info' | 'warning' | 'critical';
  resourceId: string;
  resourceName: string;
  node: string;
  message: string;
  summary?: string;
  value: number;
  threshold: number;
  startTime: string;
  acknowledged: boolean;
}

export interface HistoryPoint {
  timestamp: number;
  value: number;
}
