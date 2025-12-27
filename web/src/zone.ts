import {Node, NodeContainer, NodeLayout, Pod} from "./types";
import {COLORS, LAYOUT, TEXTS} from "./constants";
import {Container, Graphics, Text, TextStyle } from 'pixi.js';
import {createNodeContainer, renderNode} from "./node";

export function drawZone(nodeContainers: Map<string, NodeContainer>, drawContainer: Container, nodesByZone: Map<string, Node[]>, zoneName: string, newZoneLabelsContainer : Container, currentY: number , nodeLayouts: Map<string, NodeLayout>, layoutWidth : number, pendingPods: Pod[], filteredPods: Pod[], zooomAnimation : boolean, sortOrder: string) : number  {
    const nodesInZone = nodesByZone.get(zoneName)!;

    // Sort nodes within zone by name
    nodesInZone.sort((a, b) => a.name.localeCompare(b.name));

    // Draw Zone Header
    const zoneTitleStyle = new TextStyle({
        fontFamily: 'Arial',
        fontSize: 16,
        fill: COLORS.text.zoneHeader,
        fontWeight: 'bold',
    });

    const displayZoneName = zoneName.startsWith('zz-') ? zoneName.substring(3) : zoneName;
    const zoneTitle = new Text({text: `${displayZoneName} (${nodesInZone.length} nodes)`, style: zoneTitleStyle});
    zoneTitle.x = LAYOUT.padding;
    zoneTitle.y = currentY;
    newZoneLabelsContainer.addChild(zoneTitle);

    // Draw separator line
    const separator = new Graphics();
    separator.moveTo(LAYOUT.padding, currentY + 25);
    separator.lineTo(LAYOUT.padding + zoneTitle.width, currentY + 25);
    separator.stroke({width: 1, color: COLORS.node.border});
    newZoneLabelsContainer.addChild(separator);

    currentY += 40; // Space for header

    let currentX = LAYOUT.padding;
    let currentRowHeight = 0;

    nodesInZone.forEach(node => {
        const layout = nodeLayouts.get(node.name)!;

        if (currentX + layout.width > layoutWidth + LAYOUT.padding && currentX > LAYOUT.padding) {
            currentX = LAYOUT.padding;
            currentY += currentRowHeight + LAYOUT.padding;
            currentRowHeight = 0;
        }

        const nodePods = node.name === TEXTS.pending_zone.name
            ? pendingPods
            : filteredPods.filter(p => p.node_name === node.name);
        creatreAndRenderNode(nodeContainers, drawContainer, node, nodePods, currentX, currentY, layout.width, layout.height, layout.podsPerRow, zooomAnimation, sortOrder);

        if (layout.height > currentRowHeight) currentRowHeight = layout.height + 15;
        currentX += layout.width + LAYOUT.padding;
    });
    return currentY + currentRowHeight;
}

export function creatreAndRenderNode(nodeContainers: Map<string, NodeContainer>, drawContainer: Container, node: Node, pods: Pod[], x: number, y: number, width: number, height: number, podsPerRow: number, zooomAnimation: boolean, sortOrder: string) {
    let nodeContainer = nodeContainers.get(node.name);
    if (!nodeContainer) {
        nodeContainer = createNodeContainer(node);
        drawContainer.addChild(nodeContainer);
        nodeContainers.set(node.name, nodeContainer);
    }
    nodeContainer.x = x;
    nodeContainer.y = y;
    renderNode(nodeContainer, node, pods, width, height, podsPerRow, sortOrder, zooomAnimation, drawContainer);
}