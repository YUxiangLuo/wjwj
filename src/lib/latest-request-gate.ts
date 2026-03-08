export interface LatestRequestGate {
    start(): number;
    isCurrent(requestId: number): boolean;
    invalidate(): void;
}

export function createLatestRequestGate(): LatestRequestGate {
    let currentRequestId = 0;

    return {
        start() {
            currentRequestId += 1;
            return currentRequestId;
        },
        isCurrent(requestId: number) {
            return requestId === currentRequestId;
        },
        invalidate() {
            currentRequestId += 1;
        },
    };
}
