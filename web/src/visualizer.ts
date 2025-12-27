import { Application, Container, RenderLayer} from 'pixi.js';
import {ClusterState, Node, NodeContainer, NodeLayout} from './types';
import {LAYOUT, TEXTS} from './constants';
import {animatePodErrors} from "./pod.ts";
import {drawZone} from './zone.ts'

// Interfaces for custom container properties

export class Visualizer {
    private app: Application;
    private container: Container;
    private nodes: Map<string, NodeContainer> = new Map();


    // UI State
    private sortOrder: string = 'name';
    private namespaceFilter: string = 'all';
    private controllerFilter: string = 'all';
    private namespaces: Set<string> = new Set();
    private controllerTypes: Set<string> = new Set();
    private initialLoadComplete: boolean = false;
    private isFilterChange: boolean = false;

    private state: ClusterState = {nodes: [], pods: []}

    constructor(app: Application) {
        this.app = app;
        this.container = new Container();
        // Ensure zIndex is respected everywhere
        // @ts-ignore
        this.app.stage.sortableChildren = true;
        // @ts-ignore
        this.container.sortableChildren = true;
        const layer = new RenderLayer();
        layer.label = 'show-all-in-front';
        layer.zIndex = 1000000;
        this.container.addChild(layer);
        this.app.stage.addChild(this.container);
        this.setupInteractions();
        this.setupUI();
        this.setupAnimations();
    }

    private setupAnimations() {
        // Animation loop for fading pods
        this.app.ticker.add(() => {
            animatePodErrors(this.nodes);
        });
    }



    private setupUI() {
        const sortSelect = document.getElementById('sort-order') as HTMLSelectElement;
        const nsSelect = document.getElementById('namespace-filter') as HTMLSelectElement;
        const ctrlSelect = document.getElementById('controller-filter') as HTMLSelectElement;

        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sortOrder = (e.target as HTMLSelectElement).value;
                if (this.state) this.render(this.state);
                // Reset filter change flag after a short delay
                setTimeout(() => {
                    this.isFilterChange = false;
                }, 100);
            });
        }

        if (nsSelect) {
            nsSelect.addEventListener('change', (e) => {
                this.isFilterChange = true;
                this.namespaceFilter = (e.target as HTMLSelectElement).value;
                if (this.state) this.render(this.state);
                // Reset filter change flag after a short delay
                setTimeout(() => {
                    this.isFilterChange = false;
                }, 100);
            });
        }

        if (ctrlSelect) {
            ctrlSelect.addEventListener('change', (e) => {
                this.isFilterChange = true;
                this.controllerFilter = (e.target as HTMLSelectElement).value;
                if (this.state) this.render(this.state);
                // Reset filter change flag after a short delay
                setTimeout(() => {
                    this.isFilterChange = false;
                }, 100);
            });
        }

        // Handle window resize
        window.addEventListener('resize', () => {
            if (this.state) {
                this.render(this.state);
                this.fitToScreen();
            }
        });
    }

    private setupInteractions() {
        // Panning
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;

        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = this.app.screen;

        this.app.stage.on('pointerdown', (e) => {
            isDragging = true;
            lastX = e.global.x;
            lastY = e.global.y;
        });

        this.app.stage.on('pointerup', () => {
            isDragging = false;
        });

        this.app.stage.on('pointerupoutside', () => {
            isDragging = false;
        });

        this.app.stage.on('pointermove', (e) => {
            if (isDragging) {
                const dx = e.global.x - lastX;
                const dy = e.global.y - lastY;
                this.container.x += dx;
                this.container.y += dy;
                lastX = e.global.x;
                lastY = e.global.y;
            }
        });

        // Zooming
        const canvas = this.app.canvas as HTMLCanvasElement;
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const scaleFactor = 1.1;
            const direction = e.deltaY > 0 ? 1 / scaleFactor : scaleFactor;

            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const localPos = {
                x: (x - this.container.x) / this.container.scale.x,
                y: (y - this.container.y) / this.container.scale.y
            };

            let newScale = this.container.scale.x * direction;
            if (newScale < 0.1) newScale = 0.1;
            if (newScale > 5) newScale = 5;

            this.container.scale.set(newScale);
            this.container.x = x - localPos.x * newScale;
            this.container.y = y - localPos.y * newScale;
        });
    }


    // noinspection JSUnusedGlobalSymbols
    public start() {
        const connectEventSource = () => {
            const eventSource = new EventSource('/api/stream');
            eventSource.onmessage = (event) => {
                try {
                    this.state = JSON.parse(event.data);

                    this.updateNamespaces(this.state);
                    this.updateControllerTypes(this.state);
                    this.render(this.state);
                } catch (error) {
                    console.error('Error parsing SSE data:', error);
                }
            };

            eventSource.onerror = (error) => {
                console.error('SSE connection error:', error);
                eventSource.close();
                // Attempt to reconnect after a delay
                setTimeout(() => {
                    console.log('Reconnecting');
                    connectEventSource();
                }, 5000);
            };

            // Handle cleanup when page is unloaded
            window.addEventListener('beforeunload', () => {
                eventSource.close();
            });
        };

        connectEventSource();
    }

    private updateNamespaces(state: ClusterState) {
        const currentNamespaces = new Set(state.pods.map(p => p.namespace));
        let changed = false;

        currentNamespaces.forEach(ns => {
            if (!this.namespaces.has(ns)) {
                this.namespaces.add(ns);
                changed = true;
            }
        });

        if (changed) {
            const nsSelect = document.getElementById('namespace-filter') as HTMLSelectElement;
            if (nsSelect) {
                // Keep selected value
                const selected = nsSelect.value;

                // Clear options (except 'all')
                while (nsSelect.options.length > 1) {
                    nsSelect.remove(1);
                }

                // Add sorted namespaces
                Array.from(this.namespaces).sort().forEach(ns => {
                    const option = document.createElement('option');
                    option.value = ns;
                    option.text = ns;
                    nsSelect.add(option);
                });

                nsSelect.value = selected;
            }
        }
    }

    private updateControllerTypes(state: ClusterState) {
        const currentTypes = new Set(state.pods.map(p => p.controller_type));
        let changed = false;

        currentTypes.forEach(type => {
            if (!this.controllerTypes.has(type)) {
                this.controllerTypes.add(type);
                changed = true;
            }
        });

        if (changed) {
            const ctrlSelect = document.getElementById('controller-filter') as HTMLSelectElement;
            if (ctrlSelect) {
                const selected = ctrlSelect.value;

                // Clear options (except 'all')
                while (ctrlSelect.options.length > 1) {
                    ctrlSelect.remove(1);
                }

                // Add sorted controller types
                Array.from(this.controllerTypes).sort().forEach(type => {
                    const option = document.createElement('option');
                    option.value = type;
                    option.text = type;
                    ctrlSelect.add(option);
                });

                ctrlSelect.value = selected;
            }
        }
    }

    private render(state: ClusterState) {

        const zooomAnimation = (this.initialLoadComplete && !this.isFilterChange);

        // Filter pods based on namespace and controller type
        let filteredPods = state.pods;

        if (this.namespaceFilter !== 'all') {
            filteredPods = filteredPods.filter(p => p.namespace === this.namespaceFilter)
        }

        if (this.controllerFilter !== 'all') {
            filteredPods = filteredPods.filter(p => p.controller_type === this.controllerFilter);
        }

        // Identify pending pods and create virtual node if needed
        const pendingPods = filteredPods.filter(p => !p.node_name);
        const nodesList = [...state.nodes];

        if (pendingPods.length > 0) {
            nodesList.push({
                name: TEXTS.pending_zone.name,
                status: 'Pending',
                roles: ['pending'],
                labels: { 'failure-domain.beta.kubernetes.io/zone': 'zz-Quantum space' },
                capacity: {
                    pods: pendingPods.length.toString(),
                    cpu: '0',
                    memory: '0'
                },
                allocatable: {
                    pods: pendingPods.length.toString(),
                    cpu: '0',
                    memory: '0'
                },
                metrics: { cpu: '0', memory: '0' }
            });
        }

        // Track which nodes are in the new state
        const currentNodeNames = new Set(nodesList.map(n => n.name));

        // Remove nodes that no longer exist
        this.nodes.forEach((container, nodeName) => {
            if (!currentNodeNames.has(nodeName)) {
                this.container.removeChild(container);
                container.destroy(true);
                this.nodes.delete(nodeName);
            }
        });

        // Remove old zone labels
        const zoneLabelsContainer = this.container.getChildByName('zoneLabels');
        if (zoneLabelsContainer) {
            this.container.removeChild(zoneLabelsContainer);
            zoneLabelsContainer.destroy(true);
        }

        // Create new zone labels container
        const newZoneLabelsContainer = new Container();
        newZoneLabelsContainer.label = 'zoneLabels';
        newZoneLabelsContainer.zIndex = -1; // Behind nodes
        this.container.addChildAt(newZoneLabelsContainer, 0);


        // 1. Calculate dimensions for each node

        const nodeLayouts = new Map<string, NodeLayout>();
        let maxNodeWidth: number = LAYOUT.node.minWidth;
        let maxNodeHeight: number = LAYOUT.node.minHeight;

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.font = 'bold 13px Arial';
        }

        nodesList.forEach(node => {
            const nodePods = node.name === TEXTS.pending_zone.name
                ? pendingPods
                : filteredPods.filter(p => p.node_name === node.name);
            const podCount = nodePods.length;

            let podsPerRow = Math.ceil(Math.sqrt(podCount));
            if (podsPerRow < 1) podsPerRow = 1;

            const rows = Math.ceil(podCount / podsPerRow);

            const podsAreaWidth = podsPerRow * (LAYOUT.pod.size + LAYOUT.pod.gap) - LAYOUT.pod.gap;
            const podsAreaHeight = rows * (LAYOUT.pod.size + LAYOUT.pod.gap) - LAYOUT.pod.gap;

            const rightPadding = 20;
            const bottomPadding = 20;

            let width = LAYOUT.node.sidebarWidth + podsAreaWidth + rightPadding;
            let height = LAYOUT.node.headerHeight + podsAreaHeight + bottomPadding;

            if (tempCtx) {
                const textMetrics = tempCtx.measureText(node.name);
                const nameWidth = textMetrics.width + 40; // 10px padding left + extra buffer
                if (width < nameWidth) width = nameWidth;
            }

            if (width < LAYOUT.node.minWidth) width = LAYOUT.node.minWidth;
            if (height < LAYOUT.node.minHeight) height = LAYOUT.node.minHeight;

            if (width > maxNodeWidth) maxNodeWidth = width;
            if (height > maxNodeHeight) maxNodeHeight = height;

            nodeLayouts.set(node.name, {width, height, podsPerRow});
        });



        // Normalize dimensions to the greatest found
        nodeLayouts.forEach(layout => {
            layout.width = maxNodeWidth;
            layout.height = maxNodeHeight;
        });

        // Calculate optimal layout width based on screen aspect ratio
        const screenWidth = this.app.screen.width;
        const screenHeight = this.app.screen.height - LAYOUT.topMenuHeight;
        const screenRatio = screenWidth / screenHeight;

        // Calculate total area needed for all nodes including padding
        const totalNodes = nodesList.length;
        const nodeArea = (maxNodeWidth + LAYOUT.padding) * (maxNodeHeight + LAYOUT.padding);
        const totalArea = totalNodes * nodeArea;

        // Determine target width: W = sqrt(Area * Ratio)
        // This creates a layout with the same aspect ratio as the screen
        const optimalWidth = Math.sqrt(totalArea * screenRatio);

        // Use the larger of screen width or optimal width to ensure we use available space
        // but expand if necessary to maintain aspect ratio for "fit to screen"
        const layoutWidth = Math.max(screenWidth - 2 * LAYOUT.padding, optimalWidth);

        // 2. Group nodes by Zone
        const nodesByZone = new Map<string, Node[]>();
        const defaultZoneName = 'No Zone';

        nodesList.forEach(node => {
            const zone = node.labels['failure-domain.beta.kubernetes.io/zone'] ||
                node.labels['topology.kubernetes.io/zone'] ||
                defaultZoneName;

            if (!nodesByZone.has(zone)) {
                nodesByZone.set(zone, []);
            }
            nodesByZone.get(zone)!.push(node);
        });
        // Sort zones
        const sortedZones = Array.from(nodesByZone.keys()).sort();

        // 3. Flow Layout with Zones
        let currentY: number = LAYOUT.padding;

        sortedZones.forEach(zoneName => {
            // Move to next line for next zone
            currentY = drawZone(this.nodes, this.container, nodesByZone, zoneName, newZoneLabelsContainer, currentY, nodeLayouts, layoutWidth, pendingPods, filteredPods, zooomAnimation, this.sortOrder);
        });
        // Auto-fit on initial load or filter change
        if (!this.initialLoadComplete || this.isFilterChange) {
            this.fitToScreen();
        }
        // Mark initial load as complete after first render
        if (!this.initialLoadComplete) {
            this.initialLoadComplete = true;
        }
    }

    private fitToScreen() {
        const bounds = this.container.getLocalBounds();
        if (bounds.width <= 0 || bounds.height <= 0) return;

        const availableWidth = this.app.screen.width - (2 * LAYOUT.padding);
        const availableHeight = this.app.screen.height - LAYOUT.topMenuHeight - (2 * LAYOUT.padding);

        let scale = Math.min(
            availableWidth / bounds.width,
            availableHeight / bounds.height
        );

        // Cap scale at 1.0 to avoid upscaling blurriness, but allow downscaling
        if (scale > 1) scale = 1;

        this.container.scale.set(scale);

        // Center horizontally
        const scaledWidth = bounds.width * scale;
        this.container.x = (this.app.screen.width - scaledWidth) / 2 - (bounds.x * scale);

        // Position vertically below top menu
        this.container.y = LAYOUT.topMenuHeight + LAYOUT.padding - (bounds.y * scale);
    }

}



