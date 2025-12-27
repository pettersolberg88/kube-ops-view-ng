import {Container} from "pixi.js";

export interface Metrics {
    cpu: string;
    memory: string;
}

export interface Node {
    name: string;
    status: string;
    roles: string[];
    labels: { [key: string]: string };
    capacity: { [key: string]: string };
    allocatable: { [key: string]: string };
    metrics?: Metrics;
    version?: string;
    kernel_version?: string;
    os_image?: string;
    container_runtime_version?: string;
}

export interface ContainerInfo {
    name: string;
    state: string;
    ready: boolean;
    restarts: number;
}

export interface PodResources {
    cpu_requested: string;
    cpu_limit: string;
    memory_requested: string;
    memory_limit: string;
}

export interface Pod {
    name: string;
    namespace: string;
    status: string;
    node_name: string;
    labels: { [key: string]: string };
    metrics?: Metrics;
    ip?: string;
    start_time?: string;
    restarts?: number;
    containers?: ContainerInfo[];
    resources?: PodResources;
    controller_type: string;
}

export interface ClusterState {
    nodes: Node[];
    pods: Pod[];
}

export type NodeContainer = Container

export type PodContainer = Container & {
    podId?: string;
    podStatus?: string;
    isAnimating?: boolean;
    isAnimatingRemoval?: boolean;
    drawContainer: Container;
};

export type NodeLayout = {
    width: number;
    height: number;
    podsPerRow: number;
};
