type InsertableDatabase = {
    insert: (table: any) => {
        values: (values: any) => Promise<Array<{ insertId?: number }>> | {
            returning?: (fields: { id: any }) => Promise<Array<{ id?: number; insertId?: number }>>;
        };
    };
};

export async function insertReturningId(database: InsertableDatabase, table: any, values: any) {
    const query = database.insert(table).values(values);
    if (query && typeof query === "object" && "returning" in query && typeof query.returning === "function") {
        const [row] = await query.returning({ id: table.id });
        return Number(row?.id ?? row?.insertId ?? 0);
    }

    const [row] = (await query) as Array<{ insertId?: number; id?: number }>;
    return Number(row?.id ?? row?.insertId ?? 0);
}
