import { expect, test } from "bun:test";
import { transformSourceRows, type TableSpec } from "./migrate-mysql-to-postgres";

const jsonTable = {
    name: "json_fixture",
    columns: ["id", "large_number", "nested_number", "json_null", "sql_null"],
    jsonColumns: ["large_number", "nested_number", "json_null", "sql_null"],
} as const satisfies TableSpec;

test("MySQL migration keeps raw JSON text until PostgreSQL parses it", () => {
    const [row] = transformSourceRows(jsonTable, [{
        id: 1,
        large_number: "9007199254740993",
        nested_number: '{"value":9007199254740993}',
        json_null: "null",
        sql_null: null,
    }], "+09:00");

    expect(row).toEqual({
        id: 1,
        large_number: "9007199254740993",
        nested_number: '{"value":9007199254740993}',
        json_null: "null",
        sql_null: null,
    });
});

test("MySQL migration rejects malformed raw JSON", () => {
    expect(() => transformSourceRows(jsonTable, [{
        id: 1,
        large_number: "not-json",
        nested_number: "{}",
        json_null: "null",
        sql_null: null,
    }], "+09:00")).toThrow("json_fixture[0].large_number: invalid JSON");
});
