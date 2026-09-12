type QueryKind = "select" | "insert" | "update" | "delete";

type QueueMap = {
    select?: unknown[];
    insert?: unknown[];
    update?: unknown[];
    delete?: unknown[];
};

export interface MockDbOperation {
    kind: QueryKind | "execute" | "transaction";
    table?: unknown;
    values?: unknown;
    onConflictDoNothing?: boolean;
    lockStrength?: string;
    set?: unknown;
    where?: unknown;
    joins?: Array<{ type: string; table: unknown; condition?: unknown }>;
    selection?: unknown;
    query?: unknown;
}

interface MockDbClient {
    select(selection?: unknown): ReturnType<typeof createBuilder>;
    insert(table: unknown): ReturnType<typeof createBuilder>;
    update(table: unknown): ReturnType<typeof createBuilder>;
    delete(table: unknown): ReturnType<typeof createBuilder>;
    execute(query: unknown): Promise<unknown[]>;
    transaction<T>(callback: (tx: MockDbClient) => Promise<T> | T): Promise<T>;
}

function shiftQueue(kind: QueryKind, queues: Required<QueueMap>) {
    const queue = queues[kind];
    if (queue.length > 0) return queue.shift();

    switch (kind) {
        case "select":
            return [];
        case "insert":
        case "update":
        case "delete":
        default:
            return [{ id: 1 }];
    }
}

function createBuilder(kind: QueryKind, operation: MockDbOperation, queues: Required<QueueMap>, operations: MockDbOperation[]) {
    const builder = {
        $dynamic() {
            return builder;
        },
        from(table: unknown) {
            operation.table = table;
            return builder;
        },
        innerJoin(table: unknown, condition?: unknown) {
            operation.joins ??= [];
            operation.joins.push({ type: "innerJoin", table, condition });
            return builder;
        },
        leftJoin(table: unknown, condition?: unknown) {
            operation.joins ??= [];
            operation.joins.push({ type: "leftJoin", table, condition });
            return builder;
        },
        where(where: unknown) {
            operation.where = where;
            return builder;
        },
        limit() {
            return builder;
        },
        offset() {
            return builder;
        },
        orderBy() {
            return builder;
        },
        groupBy() {
            return builder;
        },
        for(strength: string) {
            operation.lockStrength = strength;
            return builder;
        },
        values(values: unknown) {
            operation.values = values;
            return builder;
        },
        set(values: unknown) {
            operation.set = values;
            return builder;
        },
        onConflictDoUpdate() {
            return builder;
        },
        onConflictDoNothing() {
            operation.onConflictDoNothing = true;
            return builder;
        },
        returning(selection?: unknown) {
            operation.selection = selection;
            return builder;
        },
        then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
            operations.push({ ...operation });
            return Promise.resolve(shiftQueue(kind, queues)).then(resolve, reject);
        },
    };

    return builder;
}

export function createMockDb(queues: QueueMap = {}) {
    const normalizedQueues: Required<QueueMap> = {
        select: [...(queues.select ?? [])],
        insert: [...(queues.insert ?? [])],
        update: [...(queues.update ?? [])],
        delete: [...(queues.delete ?? [])],
    };

    const operations: MockDbOperation[] = [];

    const db: MockDbClient = {
        select(selection?: unknown) {
            return createBuilder("select", { kind: "select", selection }, normalizedQueues, operations);
        },
        insert(table: unknown) {
            return createBuilder("insert", { kind: "insert", table }, normalizedQueues, operations);
        },
        update(table: unknown) {
            return createBuilder("update", { kind: "update", table }, normalizedQueues, operations);
        },
        delete(table: unknown) {
            return createBuilder("delete", { kind: "delete", table }, normalizedQueues, operations);
        },
        async execute(query: unknown) {
            operations.push({ kind: "execute", query });
            return [];
        },
        async transaction<T>(callback: (tx: typeof db) => Promise<T> | T) {
            operations.push({ kind: "transaction" });
            return callback(db);
        },
    };

    return { db, operations };
}
