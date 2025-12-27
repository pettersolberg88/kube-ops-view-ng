import {Container, Graphics, Text, TextStyle} from "pixi.js";
import {NodeContainer, Pod, Node, PodContainer} from "./types.ts";
import {getMetricColor, getNodeColor, parseMemoryValue, parseMetricValue} from "./utils.ts";
import {animatePodPosition, animatePodRemoval, animatePodZoomIn, drawPod, getPodTooltipText} from "./pod.ts";
import {COLORS, LAYOUT} from "./constants.ts";

export function renderPodsOnNode(container: Container, pods: Pod[], podsPerRow: number, sortOrder: string, zooomAnimation: boolean, drawContainer: Container) {
    let podLayer = container.getChildByName('pods') as Container;
    if (!podLayer) {
        podLayer = new Container();
        podLayer.label = 'pods';
        podLayer.y = 45;
        podLayer.x = 60;
        // @ts-ignore
        podLayer.sortableChildren = true;
        container.addChild(podLayer);
    }

    // Track existing pods by their unique ID
    const existingPods = new Map<string, PodContainer>();
    podLayer.children.forEach(child => {
        const podId = (child as any).podId;
        if (podId) {
            existingPods.set(podId, child as PodContainer);
        }
    });

    // Sort pods based on selected order
    pods.sort((a, b) => {
        switch (sortOrder) {
            case 'age':
                const timeA = a.start_time ? new Date(a.start_time).getTime() : 0;
                const timeB = b.start_time ? new Date(b.start_time).getTime() : 0;
                if ((timeA - timeB) == 0){
                    return a.name.localeCompare(b.name);
                }
                return timeA - timeB;
            case 'cpu':
                const cpuA = parseMetricValue(a.resources?.cpu_requested || '0');
                const cpuB = parseMetricValue(b.resources?.cpu_requested || '0');
                if ((cpuB - cpuA) == 0 ){
                    return a.name.localeCompare(b.name);
                }
                return cpuB - cpuA; // Descending
            case 'memory':
                const memA = parseMemoryValue(a.resources?.memory_requested || '0');
                const memB = parseMemoryValue(b.resources?.memory_requested || '0');
                if ((memB - memA) == 0 ){
                    return a.name.localeCompare(b.name);
                }
                return memB - memA; // Descending
            case 'status':
                if (a.status.localeCompare(b.status) == 0){
                    return a.name.localeCompare(b.name);
                }
                return a.status.localeCompare(b.status);
            case 'name':
            default:
                return a.name.localeCompare(b.name);
        }
    });

    const podSize = 26;
    const gap = 6;
    const cols = podsPerRow;

    // Track which pods are in the current state
    const currentPodIds = new Set<string>();

    pods.forEach((pod, index) => {
        const podId = `${pod.namespace}/${pod.name}`;
        currentPodIds.add(podId);

        const col = index % cols;
        const row = Math.floor(index / cols);
        const targetX = col * (podSize + gap);
        const targetY = row * (podSize + gap);

        let podContainer = existingPods.get(podId);

        if (podContainer) {
            // Pod already exists - ensure pivot is set (in case it wasn't before)
            if (!podContainer.pivot.x) {
                podContainer.pivot.set(podSize / 2, podSize / 2);
            }

            // Adjust target position to account for pivot
            const adjustedTargetX = targetX + podSize / 2;
            const adjustedTargetY = targetY + podSize / 2;

            // Animate position change
            animatePodPosition(podContainer, adjustedTargetX, adjustedTargetY);

            // Clean up old graphics before updating
            podContainer.children.forEach(child => {
                if (child instanceof Graphics) {
                    child.destroy(true);
                }
            });

            // Update pod status
            podContainer.podStatus = pod.status;


            drawPod(podContainer,pod, podSize);

            // Update tooltip text
            const hoover = podContainer.getChildByLabel('pod-tooltip-text', true) as Text;
            if (hoover) {
                hoover.text = getPodTooltipText(pod);
            }

        } else {
            // New pod - create it
            podContainer = new Container() as PodContainer;
            if(zooomAnimation) {
                podContainer.alpha = 0;
            }
            podContainer.podId = podId;
            podContainer.podStatus = pod.status;
            podContainer.drawContainer = drawContainer;

            // Set pivot to center of pod for proper rotation/scaling
            podContainer.pivot.set(podSize / 2, podSize / 2);
            // Adjust position to compensate for pivot change
            podContainer.x = targetX + podSize / 2;
            podContainer.y = targetY + podSize / 2;

            // Set initial scale based on whether this is initial load or filter change
            if (zooomAnimation) {
                // Start with large scale for zoom-in animation (larger than screen)
                podContainer.scale.set(50);
            } else {
                // On initial load or filter change, start at normal scale (no animation)
                podContainer.scale.set(1);
            }

            drawPod(podContainer,pod, podSize);

            const tooltipText = getPodTooltipText(pod);

            const textStyle = new TextStyle({
                fontFamily: 'monospace',
                fontSize: 11,
                fill: '#ffffff',
                padding: 4,
            });
            const hoooover = new Container();

            hoooover.x = podSize + 5;
            hoooover.y = -5;
            hoooover.zIndex = 100;

            const tooltip = new Text({text: tooltipText, style: textStyle});

            tooltip.zIndex = 100;
            tooltip.label = 'pod-tooltip-text';

            const tooltipBg = new Graphics();
            tooltipBg.rect(podSize + 3, -7, tooltip.width + 4, tooltip.height + 4);
            // Use shared tooltip background color for consistency
            tooltipBg.fill({color: COLORS.tooltip.bg, alpha: 0.7});
            //tooltipBg.visible = false;
            tooltipBg.zIndex = 99;

            hoooover.addChild(tooltipBg)
            hoooover.addChild(tooltip);
            hoooover.visible = false


            podContainer.addChild(hoooover);


            podContainer.eventMode = 'static';
            podContainer.cursor = 'pointer';

            podContainer.on('pointerover', () => {
                // Don't show tooltip if pod is being animated
                // @ts-ignore
                if (podContainer.isAnimating) {
                    return;
                }
                hoooover.visible = true;
                // @ts-ignore

                // Set on top of other pods
                podLayer.setChildIndex(podContainer, podLayer.children.length - 1);
                // Lift the whole node container above others
                (container as any).zIndex = 1000;
            });

            podContainer.on('pointerout', () => {
                hoooover.visible = false;
                (container as any).zIndex = 0;
            });

            // Follow cursor for pod tooltip
            podContainer.on('pointermove', (e: any) => {
                if (!hoooover.visible) return;
                // Position relative to the node container, then to podContainer
                // @ts-ignore
                const local = podContainer.toLocal(e.global);
                const offset = 12;
                hoooover.x = local.x + offset;
                hoooover.y = local.y + offset;
                tooltipBg.clear();
                tooltipBg.rect(tooltip.x - 2, tooltip.y - 2, tooltip.width + 4, tooltip.height + 4);
                tooltipBg.fill({color: COLORS.tooltip.bg, alpha: 0.7});
            });

            podLayer.addChild(podContainer);

            // Only animate zoom-in effect if initial load is complete and not a filter change
            if (zooomAnimation) {
                animatePodZoomIn(podContainer);
            }
        }
    });

    // Remove pods that no longer exist
    existingPods.forEach((podContainer, podId) => {
        if (!currentPodIds.has(podId)) {
            // Only animate removal if not a filter change
            if (zooomAnimation) {
                animatePodRemoval(podContainer, podLayer);
            } else {
                // Immediate removal during filter changes or initial load
                podLayer.removeChild(podContainer);
                podContainer.destroy(true);
            }
        }
    });
}

export function renderNodeMetrics(container: NodeContainer, node: Node, pods: Pod[], height: number) {
    if (!node.metrics) return;

    const barHeight = height - LAYOUT.node.barHeightOffset;

    let requestedCpu = 0;
    let requestedMem = 0;
    pods.forEach(pod => {
        if (pod.resources) {
            requestedCpu += parseMetricValue(pod.resources.cpu_requested);
            requestedMem += parseMemoryValue(pod.resources.memory_requested);
        }
    });

    let cpuPercent = 0;
    let cpuReqPercent = 0;
    const cpuCapacity = parseMetricValue(node.capacity.cpu);
    const cpuAllocatable = parseMetricValue(node.allocatable?.cpu || node.capacity.cpu);
    const cpuAvailable = cpuAllocatable - requestedCpu;
    const cpuReserved = Math.max(0, cpuCapacity - cpuAllocatable);
    const cpuUsed = parseMetricValue(node.metrics.cpu);

    if (cpuCapacity > 0 && cpuAllocatable > 0) {
        cpuPercent = Math.min((cpuUsed / cpuCapacity) * 100, 100);
        cpuReqPercent = Math.min((requestedCpu / cpuAllocatable) * 100, 100);
    }

    let memPercent = 0;
    let memReqPercent = 0;
    const memCapacity = parseMemoryValue(node.capacity.memory);
    const memAllocatable = parseMemoryValue(node.allocatable?.memory || node.capacity.memory);
    const memAvailable = memAllocatable - requestedMem;
    const memReserved = Math.max(0, memCapacity - memAllocatable);
    const memUsed = parseMemoryValue(node.metrics.memory);

    if (memCapacity > 0) {
        memPercent = Math.min((memUsed / memCapacity) * 100, 100);
        memReqPercent = Math.min((requestedMem / memAllocatable) * 100, 100);
    }

    const podCapacity = parseInt(node.capacity.pods || '0');
    const podUsed = pods.length;


    const resourceTooltipText = (container.getChildByLabel('node-resource-tooltip', true) as Text);
    if (resourceTooltipText != null) {
        resourceTooltipText.text = `CPU:
  Used     : ${cpuUsed.toFixed(2)}
  Capacity : ${cpuCapacity.toFixed(2)}
  Available: ${cpuAvailable.toFixed(2)}
  Requested: ${requestedCpu.toFixed(2)}
  Reserved : ${cpuReserved.toFixed(2)}

Memory:
  Used     : ${(memUsed / 1024 / 1024 / 1024).toFixed(2)} GiB
  Capacity : ${(memCapacity / 1024 / 1024 / 1024).toFixed(2)} GiB
  Available: ${(memAvailable / 1024 / 1024 / 1024).toFixed(2)} GB
  Requested: ${(requestedMem / 1024 / 1024 / 1024).toFixed(2)} GiB
  Reserved : ${(memReserved / 1024 / 1024 / 1024).toFixed(2)} GiB

Pods:
  Used     : ${podUsed}
  Capacity : ${podCapacity}`;

    }
    const resourceTooltipBackground = (container.getChildByLabel('node-resource-tooltip-bg', true) as Graphics);
    if (resourceTooltipBackground != null) {
        resourceTooltipBackground.clear();
        resourceTooltipBackground.rect(resourceTooltipText.x - 2, resourceTooltipText.y - 2, resourceTooltipText.width + 4, resourceTooltipText.height + 4);
        resourceTooltipBackground.fill({color: COLORS.tooltip.bg, alpha: COLORS.tooltip.alpha});
    }

    const nodeCpuRequestBar = (container.getChildByLabel('node-cpu-bar-request', true) as Graphics);
    if (nodeCpuRequestBar != null) {
        const fillHeight = (barHeight * cpuReqPercent) / 100;
        nodeCpuRequestBar.clear();
        nodeCpuRequestBar.rect(LAYOUT.node.barX, LAYOUT.node.barY + barHeight - fillHeight, LAYOUT.node.subBarWidth, fillHeight);
        nodeCpuRequestBar.fill(COLORS.node.barInformal);
    }

    const nodeCpuUsageBar = (container.getChildByLabel('node-cpu-bar-usage', true) as Graphics);
    if (nodeCpuUsageBar != null) {
        const fillHeight = (barHeight * cpuPercent) / 100;
        nodeCpuUsageBar.clear();
        nodeCpuUsageBar.rect(LAYOUT.node.barX + LAYOUT.node.subBarWidth + 1, LAYOUT.node.barY + barHeight - fillHeight, LAYOUT.node.subBarWidth, fillHeight);
        nodeCpuUsageBar.fill(getMetricColor(cpuPercent));
    }

    const nodeMemoryRequestBar = (container.getChildByLabel('node-memory-bar-request', true) as Graphics);
    if (nodeMemoryRequestBar != null) {
        const fillHeight = (barHeight * memReqPercent) / 100;
        nodeMemoryRequestBar.clear();
        nodeMemoryRequestBar.rect(LAYOUT.node.barX + 25, LAYOUT.node.barY + barHeight - fillHeight, LAYOUT.node.subBarWidth, fillHeight);
        nodeMemoryRequestBar.fill(COLORS.node.barInformal);
    }

    const nodeMemoryUsageBar = (container.getChildByLabel('node-memory-bar-usage', true) as Graphics);
    if (nodeMemoryUsageBar != null) {
        const fillHeight = (barHeight * memPercent) / 100;
        nodeMemoryUsageBar.clear();
        nodeMemoryUsageBar.rect(LAYOUT.node.barX + 25 + LAYOUT.node.subBarWidth + 1, LAYOUT.node.barY + barHeight - fillHeight, LAYOUT.node.subBarWidth, fillHeight);
        nodeMemoryUsageBar.fill(getMetricColor(memPercent));
    }
    container.sortChildren();
}

export function createNodeContainer(node: Node): NodeContainer {
    const container = new Container() as NodeContainer;
    // @ts-ignore
    container.sortableChildren = true;

    const bg = new Graphics();
    bg.label = 'node-background';
    container.addChild(bg);

    // Title bar

    const titleBar = new Graphics();
    titleBar.eventMode = 'static';
    titleBar.cursor = 'pointer';
    titleBar.label = 'node-titlebar';
    container.addChild(titleBar);

    const nameStyle = new TextStyle({
        fontFamily: 'Arial',
        fontSize: 13,
        fill: COLORS.text.primary,
        fontWeight: 'bold',
    });

    const nameText = new Text({text: node.name, style: nameStyle});
    nameText.x = 10;
    nameText.y = 10;
    nameText.label = 'node-name';
    container.addChild(nameText);


    const titleHooover = new Container();
    titleHooover.zIndex = 100000;
    titleHooover.visible = false;
    titleHooover.x = 10;
    titleHooover.y = 40;
    titleHooover.label = 'node-tooltip';

    const tooltipStyle = new TextStyle({
        fontFamily: 'monospace',
        fontSize: 12,
        fill: COLORS.tooltip.text,
        padding: 4,
    });
    const nodeTooltip = new Text({ style: tooltipStyle});
    nodeTooltip.label = 'node-tooltip-text';
    //nodeTooltip.x = 10;
    //nodeTooltip.y = 40;
    //nodeTooltip.visible = false;

    const nodeTooltipBg = new Graphics();
    nodeTooltipBg.rect(8, 38, nodeTooltip.width + 4, nodeTooltip.height + 4);
    nodeTooltipBg.fill({color: COLORS.tooltip.bg, alpha: 0.7});
    //nodeTooltipBg.visible = false;

    titleHooover.addChild(nodeTooltipBg);
    titleHooover.addChild(nodeTooltip);
    container.addChild(titleHooover);

    titleBar.on('pointerover', () => {
        titleHooover.visible = true;
        container.zIndex = 1000;
    });

    titleBar.on('pointerout', () => {
        titleHooover.visible = false;
        container.zIndex = 0;
    });

    // Follow cursor for node tooltip
    titleBar.on('pointermove', (e: any) => {
        if (!titleHooover.visible) return;
        const local = container.toLocal(e.global);
        const offset = 12;
        titleHooover.x = local.x + offset;
        titleHooover.y = local.y + offset;
        nodeTooltipBg.clear();
        nodeTooltipBg.rect(nodeTooltip.x - 2, nodeTooltip.y - 2, nodeTooltip.width + 4, nodeTooltip.height + 4);
        nodeTooltipBg.fill({color: COLORS.tooltip.bg, alpha: 0.7});
    });

    // Metrics bar
    const resourceBars = new Container();
    resourceBars.label = 'node-resource-bars';

    const cpuBarBg = new Graphics();
    cpuBarBg.eventMode = 'static';
    cpuBarBg.cursor = 'pointer';
    cpuBarBg.label = 'node-cpu-bar-bg';
    resourceBars.addChild(cpuBarBg);

    if (node.capacity && node.capacity.cpu) {
        const numCores = Math.ceil(parseMetricValue(node.capacity.cpu));
        if (numCores > 1) {
            const dividerContainer = new Container();
            dividerContainer.label = 'node-cpu-dividers';
            resourceBars.addChild(dividerContainer);
        }
    }

    const cpuRequestBar = new Graphics();
    cpuRequestBar.label = 'node-cpu-bar-request';
    cpuRequestBar.zIndex = 20;
    resourceBars.addChild(cpuRequestBar);

    const cpuBar = new Graphics();
    cpuBar.label = 'node-cpu-bar-usage';
    cpuBar.zIndex = 20;
    resourceBars.addChild(cpuBar);

    const memoryRequestBar = new Graphics();
    memoryRequestBar.label = 'node-memory-bar-request';
    memoryRequestBar.zIndex = 20;
    resourceBars.addChild(memoryRequestBar);

    const memoryBar = new Graphics();
    memoryBar.label = 'node-memory-bar-usage';
    memoryBar.zIndex = 20;
    resourceBars.addChild(memoryBar);

    const memBarBg = new Graphics();
    memBarBg.label = 'node-mem-bar-bg';
    memBarBg.eventMode = 'static';
    memBarBg.cursor = 'pointer';
    resourceBars.addChild(memBarBg);

    const labelStyle = new TextStyle({fontSize: 9, fill: COLORS.text.secondary});
    const cpuLabel = new Text({text: 'CPU', style: labelStyle});
    cpuLabel.x = LAYOUT.node.barX + 1;
    cpuLabel.label = 'node-cpu-label';
    resourceBars.addChild(cpuLabel);

    const memLabel = new Text({text: 'MEM', style: labelStyle});
    memLabel.x = LAYOUT.node.barX + 24;
    memLabel.label = 'node-mem-label';
    resourceBars.addChild(memLabel);


    container.addChild(resourceBars);

    const nodeResourceTooltipStyle = new TextStyle({
        fontFamily: 'monospace',
        fontSize: 12,
        fill: COLORS.tooltip.text,
        padding: 4,
    });
    const resourceTooltip = new Text({text: '', style: nodeResourceTooltipStyle});
    resourceTooltip.label = 'node-resource-tooltip';
    resourceTooltip.x = LAYOUT.node.barX + LAYOUT.node.totalBarWidth * 2 + 15;
    resourceTooltip.y = LAYOUT.node.barY;
    resourceTooltip.visible = false;
    resourceTooltip.zIndex = 100000;

    const resTooltipBg = new Graphics();
    resTooltipBg.label = 'node-resource-tooltip-bg';
    resTooltipBg.visible = false;
    resTooltipBg.zIndex = 99999;


    container.addChild(resTooltipBg);
    container.addChild(resourceTooltip);

    const showResTooltip = () => {
        resourceTooltip.visible = true;
        resTooltipBg.visible = true;
        container.zIndex = 1000;
    };
    const hideResTooltip = () => {
        resourceTooltip.visible = false;
        resTooltipBg.visible = false;
        container.zIndex = 0;
    };

    cpuBarBg.on('pointerover', showResTooltip);
    cpuBarBg.on('pointerout', hideResTooltip);
    cpuBarBg.on('pointermove', (e: any) => {
        if (!resourceTooltip.visible) return;
        const local = container.toLocal(e.global);
        const offset = 12;
        resourceTooltip.x = local.x + offset;
        resourceTooltip.y = local.y + offset;
        resTooltipBg.clear();
        resTooltipBg.rect(resourceTooltip.x - 2, resourceTooltip.y - 2, resourceTooltip.width + 4, resourceTooltip.height + 4);
        resTooltipBg.fill({color: COLORS.tooltip.bg, alpha: 0.7});
    });
    memBarBg.on('pointerover', showResTooltip);
    memBarBg.on('pointerout', hideResTooltip);
    memBarBg.on('pointermove', (e: any) => {
        if (!resourceTooltip.visible) return;
        const local = container.toLocal(e.global);
        const offset = 12;
        resourceTooltip.x = local.x + offset;
        resourceTooltip.y = local.y + offset;
        resTooltipBg.clear();
        resTooltipBg.rect(resourceTooltip.x - 2, resourceTooltip.y - 2, resourceTooltip.width + 4, resourceTooltip.height + 4);
        resTooltipBg.fill({color: COLORS.tooltip.bg, alpha: 0.7});
    });
    return container;
}

export function renderNodeContainer(container: NodeContainer, node: Node, width: number, height: number) {

    const barHeight = height - LAYOUT.node.barHeightOffset;

    const bg = (container.getChildByLabel('node-background') as Graphics);
    if (bg) {
        bg.clear();
        bg.rect(0, 0, width, height);
        bg.fill(COLORS.node.background);
        bg.stroke({width: 2, color: COLORS.node.border});
    }

    const titleBar = (container.getChildByLabel('node-titlebar') as Graphics);
    if (titleBar) {
        titleBar.clear();
        titleBar.rect(0, 0, width, LAYOUT.node.headerHeight);
        titleBar.fill(getNodeColor(node));
    }
    const name = (container.getChildByLabel('node-name') as Text);
    if (name) {
        name.text = node.name;
    }
    const nodeTooltip = (container.getChildByLabel('node-tooltip-text', true) as Text);
    if (nodeTooltip) {
        nodeTooltip.text = `Name:    ${node.name}
Status:  ${node.status}
Role:    ${node.roles.join(', ')}
Version: ${node.version || 'N/A'}
OS:      ${node.os_image || 'N/A'}
Kernel:  ${node.kernel_version || 'N/A'}
Runtime: ${node.container_runtime_version || 'N/A'}`;
    }


    const cpuBarBg = (container.getChildByLabel('node-cpu-bar-bg', true) as Graphics);
    cpuBarBg.clear();
    cpuBarBg.rect(LAYOUT.node.barX, LAYOUT.node.barY, LAYOUT.node.totalBarWidth, barHeight);
    cpuBarBg.fill(COLORS.node.barBackground);
    cpuBarBg.stroke({width: 1, color: COLORS.node.border});

    const memBarBg = (container.getChildByLabel('node-mem-bar-bg', true) as Graphics);
    memBarBg.clear();
    memBarBg.rect(LAYOUT.node.barX + 25, LAYOUT.node.barY, LAYOUT.node.totalBarWidth, barHeight);
    memBarBg.fill(COLORS.node.barBackground);
    memBarBg.stroke({width: 1, color: COLORS.node.border});

    const cpuLabel = container.getChildByLabel('node-cpu-label', true);
    if (cpuLabel) cpuLabel.y = LAYOUT.node.barY + barHeight + 3;

    const memLabel = container.getChildByLabel('node-mem-label', true);
    if (memLabel) memLabel.y = LAYOUT.node.barY + barHeight + 3;

    const dividerContainer = container.getChildByLabel('node-cpu-dividers', true) as Container;
    if (dividerContainer) {
        dividerContainer.removeChildren();
        if (node.capacity && node.capacity.cpu) {
            const numCores = Math.ceil(parseMetricValue(node.capacity.cpu));
            if (numCores > 1) {
                const step = barHeight / numCores;
                for (let i = 1; i < numCores; i++) {
                    const y = LAYOUT.node.barY + i * step;
                    const line = new Graphics();
                    line.moveTo(LAYOUT.node.barX, y);
                    line.lineTo(LAYOUT.node.barX + LAYOUT.node.totalBarWidth, y);
                    line.stroke({width: 1, color: COLORS.node.divider, alpha: 0.5});
                    dividerContainer.addChild(line);
                }
            }
        }
    }
}

export function renderNode(nodeContainer: NodeContainer, node: Node, pods: Pod[], width: number, height: number, podsPerRow: number, sortOrder: string, zooomAnimation: boolean, drawContainer: Container) {
    renderNodeContainer(nodeContainer, node, width, height);
    renderNodeMetrics(nodeContainer, node, pods, height);
    renderPodsOnNode(nodeContainer, pods, podsPerRow, sortOrder, zooomAnimation, drawContainer);
}