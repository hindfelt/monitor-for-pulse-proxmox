// @ts-nocheck -- demo data generator ported from the web server
// Demo data shaped like Pulse 6.x API responses (/api/resources, /api/alerts/active,
// /api/metrics-store/history). Numbers mirror a small single-node homelab.

const DAY = 86_400;
const GiB = 1024 ** 3;
const START = Date.now();

const node = {
  id: 'agent-node-1',
  type: 'agent',
  name: 'node-1',
  status: 'online',
  uptime: 118 * DAY,
  temperature: 48,
  sources: ['proxmox', 'agent'],
  metrics: { cpu: 2.8, memory: [63, 16 * GiB], disk: [17, 468 * GiB] },
  proxmox: { host: 'https://proxmox.example.com:8006', nodeName: 'node-1', instance: 'pve', cpus: 8, pveVersion: '9.0.6', kernelVersion: '6.14.8-2-pve' },
  health: { verdict: 'ok', reasons: [] },
};

// [name, type, vmid, cpu%, mem%, memTotalGiB, disk%, diskTotalGiB, uptimeDays, lastBackupDaysAgo|null]
const GUESTS = [
  ['web-proxy', 'system-container', 101, 0.2, 9, 1, 10, 8, 118, 6],
  ['monitoring', 'system-container', 102, 0.4, 8, 2, 22, 8, 13, 6],
  ['vpn-gateway', 'system-container', 103, 0.1, 13, 0.5, 11, 4, 84, 6],
  ['docker-apps', 'vm', 104, 0.3, 49, 4, 85, 64, 104, 9],
  ['dev-server', 'vm', 105, 1.2, 24, 8, 6, 128, 0.625, null],
  ['nas', 'vm', 106, 0.8, 28, 4, 88, 32, 118, 9],
  ['media-server', 'system-container', 107, 0.9, 32, 1, 21, 4, 19, 6],
];

const metric = (pct, total) => {
  const m = { value: pct, percent: pct };
  if (total) Object.assign(m, { total: Math.round(total), used: Math.round((total * pct) / 100) });
  return m;
};

function wobble(base, seed) {
  const t = (Date.now() - START) / 1000;
  return Math.max(0, +(base + Math.sin(t / 7 + seed) * base * 0.4).toFixed(1));
}

function guestHealth(diskPct, backupAgo) {
  const reasons = [];
  if (diskPct >= 85) reasons.push({ code: 'resource_risk', detail: `Disk at ${diskPct}%` });
  if (backupAgo === null) {
    /* Pulse's health verdict ignores "never backed up"; the app detects it from lastBackup. */
  } else if (backupAgo > 7) reasons.push({ code: 'backup_stale', detail: `${backupAgo}d` });
  return { verdict: reasons.length ? 'attention' : 'ok', reasons };
}

function buildGuest([name, type, vmid, cpu, mem, memGiB, disk, diskGiB, upDays, backupAgo], i) {
  return {
    id: `${type}-pve-node-1-${vmid}`,
    type,
    technology: type === 'vm' ? 'qemu' : 'lxc',
    name,
    status: 'running',
    parentId: node.id,
    parentName: node.name,
    sources: ['proxmox'],
    lastSeen: new Date().toISOString(),
    health: guestHealth(disk, backupAgo),
    metrics: {
      cpu: metric(wobble(cpu, i)),
      memory: metric(mem, memGiB * GiB),
      disk: metric(disk, diskGiB * GiB),
    },
    metricsTarget: { resourceType: type, resourceId: `pve:node-1:${vmid}` },
    proxmox: {
      vmid,
      uptime: Math.round(upDays * DAY),
      nodeName: 'node-1',
      instance: 'pve',
      cpus: type === 'vm' ? 2 : 1,
      lastBackup: backupAgo === null ? '0001-01-01T00:00:00Z' : new Date(Date.now() - backupAgo * DAY * 1000).toISOString(),
    },
  };
}

const STORAGE = [
  ['local', 'dir', 17, 94],
  ['local-lvm', 'lvmthin', 41, 348],
  ['nas-backups', 'nfs', 63, 1800],
];

function buildStorage([name, kind, pct, totalGiB]) {
  return {
    id: `storage-pve-node-1-${name}`,
    type: 'storage',
    name,
    status: 'online',
    parentId: node.id,
    parentName: node.name,
    sources: ['proxmox'],
    lastSeen: new Date().toISOString(),
    health: { verdict: pct >= 85 ? 'attention' : 'ok', reasons: [] },
    metrics: { disk: metric(pct, totalGiB * GiB) },
    storage: { type: kind, shared: kind === 'nfs' },
  };
}

function allResources() {
  const n = {
    ...node,
    lastSeen: new Date().toISOString(),
    metrics: {
      cpu: metric(wobble(node.metrics.cpu, 9)),
      memory: metric(node.metrics.memory[0], node.metrics.memory[1]),
      disk: metric(node.metrics.disk[0], node.metrics.disk[1]),
    },
    metricsTarget: { resourceType: 'node', resourceId: 'pve:node-1' },
  };
  return [n, ...GUESTS.map(buildGuest), ...STORAGE.map(buildStorage)];
}

function history(params) {
  const id = params.get('resourceId') || '';
  const which = params.get('metric') || 'cpu';
  const range = params.get('range') || '24h';
  const hours = range.endsWith('d') ? parseInt(range) * 24 : parseInt(range) || 24;
  const all = allResources();
  const r = all.find((x) => x.metricsTarget?.resourceId === id);
  const now = r?.metrics?.[which]?.percent ?? 10;
  const points = [];
  const n = 96;
  const seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  for (let i = 0; i < n; i++) {
    const ts = Date.now() - ((n - 1 - i) / (n - 1)) * hours * 3600_000;
    let v;
    if (which === 'disk') v = now - (n - 1 - i) * (now > 80 ? 0.12 : 0.02); // slow growth
    else v = now * (1 + 0.35 * Math.sin(i / 5 + seed) + 0.15 * Math.sin(i * 1.7 + seed));
    points.push({ timestamp: Math.round(ts), value: +Math.max(0, Math.min(100, v)).toFixed(2) });
  }
  return { resourceType: params.get('resourceType'), resourceId: id, metric: which, range, source: 'store', points };
}

export function mockResponse(pathname, params) {
  if (pathname === '/api/version') return { version: '6.6.0', build: 'demo' };
  if (pathname === '/api/health') return { status: 'healthy' };
  if (pathname === '/api/alerts/active') {
    return [
      {
        id: 'demo-disk-omv', type: 'disk', level: 'warning', resourceId: 'vm-pve-node-1-106',
        resourceName: 'nas', node: 'node-1', instance: 'pve', message: 'nas disk usage is 88%',
        summary: 'Disk usage is 88%', value: 88, threshold: 85,
        startTime: new Date(Date.now() - 3 * 3600_000).toISOString(), acknowledged: false,
      },
      {
        id: 'demo-disk-webapps', type: 'disk', level: 'warning', resourceId: 'vm-pve-node-1-104',
        resourceName: 'docker-apps', node: 'node-1', instance: 'pve', message: 'docker-apps disk usage is 85%',
        summary: 'Disk usage is 85%', value: 85, threshold: 85,
        startTime: new Date(Date.now() - 26 * 3600_000).toISOString(), acknowledged: true,
      },
    ];
  }
  if (pathname === '/api/metrics-store/history') return history(params);
  if (pathname === '/api/resources') {
    const types = (params.get('type') || '').split(',').filter(Boolean);
    const data = allResources().filter((r) => !types.length || types.includes(r.type));
    return { data, meta: { page: 1, limit: 100, total: data.length, totalPages: 1 } };
  }
  const one = pathname.match(/^\/api\/resources\/([^/]+)$/);
  if (one) return allResources().find((r) => r.id === decodeURIComponent(one[1]));
  return undefined;
}
