// Styling and layout constants extracted from visualizer

export const COLORS = {
    node: {
        background: '#1e2329',
        border: '#2b3138',
        header: {
            controlPlane: '#4c8dff',
            ready: '#2ecc71',
            notReady: '#e5533d',
            cordoned: '#f2b705',
        },
        barBackground: '#14181d',
        barInformal: '#4c8dff',
        divider: '#2b3138',
    },
    pod: {
        status: {
            terminating: '#9b59b6',
            crashLoop: '#e5533d',
            completed: '#5dade2',
            pending: '#f2b705',
            running: '#2ecc71',
            failed: '#e5533d',
            unknown: '#7f8c8d',
        },
        metric: {
            good: '#2ecc71',
            warning: '#f2b705',
            critical: '#e74c3c',
            info: '#5dade2',
            empty: '#566573',
        },
    },
    text: {
        primary: '#ecf0f1',
        secondary: '#9aa4ad',
        zoneHeader: '#c3ccd5',
    },
    tooltip: {
        bg: '#0f1216',
        alpha: 0.9,
        text: '#ecf0f1',
    },
} as const;

export const LAYOUT = {
    padding: 20,
    topMenuHeight: 40,
    zoneGap: 40,
    node: {
        minWidth: 200,
        minHeight: 150,
        headerHeight: 35,
        sidebarWidth: 60,
        barHeightOffset: 60,
        barX: 10,
        barY: 45,
        totalBarWidth: 18,
        subBarWidth: 8,
    },
    pod: {
        size: 26,
        gap: 6,
    },
} as const;

export const TEXTS = {
    pending_zone : {
        name: 'Pending Pods'
    }

} as const;
