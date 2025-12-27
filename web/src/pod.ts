import {BlurFilter, Container, Graphics, RenderLayer} from "pixi.js";
import {NodeContainer, Pod, PodContainer} from "./types.ts";
import {getPodColor, parseMemoryValue, parseMetricValue} from "./utils.ts";

export function drawPod(container: Container, pod: Pod, size: number) {
    const g = new Graphics();

    // Draw transparent fill first to make entire area interactive
    g.rect(0, 0, size, size);
    g.fill({color: 0x000000, alpha: 0}); // Transparent fill for hit detection

    // Draw border
    const borderColor = getPodColor(pod);
    g.rect(0, 0, size, size);
    g.stroke({width: 3, color: borderColor});

    const cpuUsed = parseMetricValue(pod.metrics?.cpu || '0');
    const cpuReq = parseMetricValue(pod.resources?.cpu_requested || '0');
    const cpuLim = parseMetricValue(pod.resources?.cpu_limit || '0');

    const memUsed = parseMemoryValue(pod.metrics?.memory || '0');
    const memReq = parseMemoryValue(pod.resources?.memory_requested || '0');
    const memLim = parseMemoryValue(pod.resources?.memory_limit || '0');

    const cpuMax = cpuLim > 0 ? cpuLim : (cpuReq > 0 ? cpuReq : (cpuUsed > 0 ? cpuUsed : 1));
    const memMax = memLim > 0 ? memLim : (memReq > 0 ? memReq : (memUsed > 0 ? memUsed : 1));

    const barHeight = size - 4;
    const barWidth = (size - 6) / 2;

    const cpuHeight = Math.min((cpuUsed / cpuMax) * barHeight, barHeight);
    const memHeight = Math.min((memUsed / memMax) * barHeight, barHeight);

    if (cpuHeight > 0) {
        let color = 0x27ae60;
        if (cpuReq === 0) {
            color = 0x95a5a6;
        } else if (cpuUsed > cpuReq) {
            color = 0xf39c12;
        }
        g.rect(2, size - 2 - cpuHeight, barWidth, cpuHeight);
        g.fill(color);
    }

    if (memHeight > 0) {
        let color = 0x27ae60;
        if (memReq === 0) {
            color = 0x95a5a6;
        } else if (memUsed > memReq) {
            color = 0xf39c12;
        }
        g.rect(2 + barWidth + 2, size - 2 - memHeight, barWidth, memHeight);
        g.fill(color);
    }

    if (cpuReq > 0 && cpuReq < cpuMax) {
        const reqH = (cpuReq / cpuMax) * barHeight;
        g.rect(2, size - 2 - reqH, barWidth, 1);
        g.fill(0xffffff);
    }

    if (memReq > 0 && memReq < memMax) {
        const reqH = (memReq / memMax) * barHeight;
        g.rect(2 + barWidth + 2, size - 2 - reqH, barWidth, 1);
        g.fill(0xffffff);
    }

    container.addChild(g);
}

export function getPodTooltipText(pod: Pod): string {
    const readyCount = pod.containers?.filter(c => c.ready).length || 0;
    const totalCount = pod.containers?.length || 0;
    const statusText = `${pod.status} (${readyCount}/${totalCount} ready)`;

    let text = `${pod.name}\n`;
    text += `Namespace : ${pod.namespace}\n`;
    text += `Status    : ${statusText}\n`;
    text += `Start Time: ${pod.start_time || 'N/A'}\n`;

    text += `Labels    :\n`;
    if (pod.labels) {
        for (const [k, v] of Object.entries(pod.labels)) {
            text += `  ${k}: ${v}\n`;
        }
    }

    text += `Containers:\n`;
    if (pod.containers) {
        for (const c of pod.containers) {
            text += `  ${c.name}: ${c.state} (${c.restarts} restarts)\n`;
        }

        const cpuReq = parseMetricValue(pod.resources?.cpu_requested || '0');
        const cpuLim = parseMetricValue(pod.resources?.cpu_limit || '0');
        const cpuUsed = parseMetricValue(pod.metrics?.cpu || '0');

        const memReq = parseMemoryValue(pod.resources?.memory_requested || '0');
        const memLim = parseMemoryValue(pod.resources?.memory_limit || '0');
        const memUsed = parseMemoryValue(pod.metrics?.memory || '0');

        const useCores = cpuReq >= 1 || cpuLim >= 1 || cpuUsed >= 1;
        const coreUnit = useCores ? 'Cores' : 'mCores';
        const coreMultiplier = useCores ? 1 : 1000;


        text += `CPU (${coreUnit}):\n`;
        text += `  Requested: ${(cpuReq*coreMultiplier).toFixed(3)}\n`;
        text += `  Limit:     ${(cpuLim*coreMultiplier).toFixed(3)}\n`;
        text += `  Used:      ${(cpuUsed*coreMultiplier).toFixed(3)}\n`;

        const useGiB = memReq >= 1024 * 1024 * 1024 || memLim >= 1024 * 1024 * 1024 || memUsed >= 1024 * 1024 * 1024;
        const memUnit = useGiB ? 'GiB' : 'MiB';
        const memDivisor = useGiB ? 1024 * 1024 * 1024 : 1024 * 1024;

        text += `Memory (${memUnit}):\n`;
        text += `  Requested: ${(memReq / memDivisor).toFixed(3)}\n`;
        text += `  Limit:     ${(memLim / memDivisor).toFixed(3)}\n`;
        text += `  Used:      ${(memUsed / memDivisor).toFixed(3)}\n`;
    }
    return text;
}

export function animatePodZoomIn(podContainer: PodContainer) {
    const duration = 3000; // milliseconds
    const startTime = Date.now();
    const startScale = 150; // Start very large
    const endScale = 1; // End at normal size
    const startRotation = 0; // Start rotation
    const endRotation = Math.PI * 2; // Full 360 degree rotation (2π radians)

    // Mark pod as animating
    podContainer.isAnimating = true;
    const renderLayer = podContainer.drawContainer.getChildByLabel('show-all-in-front') as RenderLayer;
    renderLayer.attach(podContainer);



    const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 2);

        // Interpolate from startScale to endScale
        const scale = startScale + (endScale - startScale) * eased;
        podContainer.alpha = eased
        if (podContainer.parent == null){
            return;
        }
        podContainer.scale.set(scale);


        // Interpolate rotation
        podContainer.rotation = startRotation + (endRotation - startRotation) * eased;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            podContainer.scale.set(1); // Ensure final scale is exactly 1
            podContainer.rotation = 0; // Ensure final rotation is 0
            renderLayer.detach(podContainer);
            (podContainer as any).isAnimating = false; // Animation complete
        }
    };
    requestAnimationFrame(animate);
}

export function animatePodRemoval(podContainer: PodContainer, podLayer: Container) {
    const growDuration = 1000; // milliseconds for grow and blur phase
    const startTime = Date.now();
    const startScale = 1;
    const maxScale = 10; // Grow to 3x size
    const maxBlur = 15; // Maximum blur amount

    if(podContainer.isAnimatingRemoval){
        return;
    }

    // Mark pod as animating
    podContainer.isAnimating = true;
    podContainer.isAnimatingRemoval = true

    // Create blur filter
    const blurFilter = new BlurFilter();
    blurFilter.strength = 0;
    podContainer.filters = [blurFilter];

    const animate = () => {
        const elapsed = Date.now() - startTime;

        if (elapsed < growDuration) {
            // Phase 1: Grow and blur
            const eased = elapsed / growDuration;

            // Scale up
            const scale = startScale + (maxScale - startScale) * eased;
            // TODO: Her feier dette med at scale er null
            if (podContainer.parent == null){
                return;
            }
            podContainer.scale.set(scale);

            // Increase blur
            //blurFilter.blur = maxBlur * eased;
            blurFilter.strength = maxBlur * eased;

            // Fade out slightly
            podContainer.alpha = 1 - (1 * eased);

            requestAnimationFrame(animate);
        } else {
            // Animation complete - remove the pod
            podLayer.removeChild(podContainer);
            podContainer.destroy(true);
        }
    };

    requestAnimationFrame(animate);
}

export function animatePodPosition(podContainer: Container, targetX: number, targetY: number) {
    // Cancel any existing animation
    const existingAnimation = (podContainer as any).positionAnimation;
    if (existingAnimation) {
        cancelAnimationFrame(existingAnimation);
    }

    const startX = podContainer.x;
    const startY = podContainer.y;
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;

    // Only animate if there's actually a position change
    if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) {
        return;
    }

    const duration = 2000; // milliseconds
    const startTime = Date.now();

    const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 3);

        if ( podContainer.parent == null){
            return;
        }
        podContainer.x = startX + deltaX * eased;
        podContainer.y = startY + deltaY * eased;

        if (progress < 1) {
            (podContainer as any).positionAnimation = requestAnimationFrame(animate);
        } else {
            (podContainer as any).positionAnimation = null;
        }
    };

    (podContainer as any).positionAnimation = requestAnimationFrame(animate);
}

export function animatePodErrors(nodes: Map<string, NodeContainer>) {
    const time = Date.now() / 1000;
    const fadeSpeed = 2 * Math.PI; // Speed of fade (higher = faster)
    const alpha = (Math.sin(time * fadeSpeed) + 1) / 2; // Oscillates between 0 and 1

    // Find all pod containers and animate error state pods
    nodes.forEach(nodeContainer => {
        const podLayer = nodeContainer.getChildByName('pods') as Container;
        if (podLayer) {
            podLayer.children.forEach(child => {
                const podContainer = child as PodContainer;
                const podStatus = podContainer.podStatus;
                if (podStatus === 'CrashLoopBackOff' ||
                    podStatus === 'ImagePullBackOff' ||
                    podStatus === 'ErrImagePull') {
                    const targetAlpha = 0.3 + (alpha * 0.7); // Fade between 0.3 and 1.0

                    // Apply alpha to all children except tooltips
                    podContainer.children.forEach(c => {
                        // Skip tooltip and tooltip background (zIndex 99 and 100)
                        if (c.zIndex !== 99 && c.zIndex !== 100) {
                            c.alpha = targetAlpha;
                        }
                    });
                } else {
                    // Ensure other pods are fully visible (except tooltips which manage their own visibility)
                    podContainer.children.forEach(c => {
                        if (c.zIndex !== 99 && c.zIndex !== 100) {
                            c.alpha = 1.0;
                        }
                    });
                }
            });
        }
    });
}

