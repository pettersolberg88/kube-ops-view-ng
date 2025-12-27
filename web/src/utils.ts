import { COLORS } from './constants';
import type { Node, Pod } from './types';

export function parseMetricValue(metric: string): number {
    if (!metric) return 0;
    // Handles values like "100m" for CPU (millicores) and plain numbers
    if (metric.endsWith('m')) {
        const v = parseFloat(metric.slice(0, -1));
        return isNaN(v) ? 0 : v / 1000;
    } else if (metric.endsWith('n')) {
        const v = parseFloat(metric.slice(0, -1));
        return isNaN(v) ? 0 : v / 1000 / 1000 / 1000;
    }
    const v = parseFloat(metric);
    return isNaN(v) ? 0 : v;
}

export function parseMemoryValue(metric: string): number {
    if (!metric) return 0;
    // Supports Ki, Mi, Gi, Ti and plain bytes
    const lower = metric.toLowerCase();
    const num = parseFloat(lower);
    if (isNaN(num)) return 0;
    if (lower.endsWith('ki')) return num * 1024;
    if (lower.endsWith('mi')) return num * 1024 * 1024;
    if (lower.endsWith('gi')) return num * 1024 * 1024 * 1024;
    if (lower.endsWith('ti')) return num * 1024 * 1024 * 1024 * 1024;
    return num; // assume bytes
}

export function getMetricColor(percent: number): string {
    if (percent < 60) return COLORS.pod.metric.good;
    if (percent < 80) return COLORS.pod.metric.warning;
    return COLORS.pod.metric.critical;
}

export function getNodeColor(node: Node): string {
    if (node.status == 'NotReady') {
        return COLORS.node.header.notReady;
    }
    else if (node.status == 'Cordoned') {
        return COLORS.node.header.cordoned;
    }else if (node.roles.includes('control-plane') || node.roles.includes('master')) {
        return COLORS.node.header.controlPlane;
    }
    return COLORS.node.header.ready;
}

export function getPodColor(pod: Pod): string {
    switch (pod.status) {
        case 'Terminating':
            return COLORS.pod.status.terminating;
        case 'CrashLoopBackOff':
        case 'ImagePullBackOff':
        case 'ErrImagePull':
        case 'Failed':
            return COLORS.pod.status.crashLoop;
        case 'Completed':
            return COLORS.pod.status.completed;
        case 'Pending':
            return COLORS.pod.status.pending;
        case 'Running':
            return COLORS.pod.status.running;
        case 'Unknown':
        default:
            return COLORS.pod.status.unknown;
    }
}
