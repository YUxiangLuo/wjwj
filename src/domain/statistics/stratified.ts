import { type NumericAccessor, fieldAccessor, extractAccessorValues } from "./values";
import { estimateSimpleDistribution } from "./distributions";
import { createSafeRecord } from "../../lib/safe-record";
import { stratumKey } from "./sampling";

export function computeStratifiedValueEstimate(
    rows: Array<Record<string, unknown>>,
    stratifyBy: string | undefined,
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
    accessor: NumericAccessor,
) {
    if (!stratifyBy || !hasCompleteStratifiedDesign(layers, totalPopulation)) {
        return null;
    }

    let estimate = 0;
    for (const layer of layers) {
        const layerRows = rows.filter((row) => stratumKey(row[stratifyBy]) === stratumKey(layer.name));
        const values = extractAccessorValues(layerRows, accessor);
        if (values.length !== layer.sampleCount || layerRows.length !== layer.sampleCount) {
            return null;
        }
        const layerMean = values.reduce((sum, value) => sum + value, 0) / values.length;
        estimate += (layer.count / totalPopulation) * layerMean;
    }

    return estimate;
}

function hasCompleteStratifiedDesign(
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
): layers is Array<{ name: string; count: number; sampleCount: number }> {
    if (!Array.isArray(layers) || layers.length === 0 || totalPopulation < 1) return false;
    const names = new Set<string>();
    let covered = 0;
    for (const layer of layers) {
        const name = stratumKey(layer.name);
        if (
            !name
            || names.has(name)
            || !Number.isInteger(layer.count)
            || layer.count < 1
            || !Number.isInteger(layer.sampleCount)
            || layer.sampleCount < 1
            || layer.sampleCount > layer.count
        ) return false;
        names.add(name);
        covered += layer.count;
    }
    return covered === totalPopulation;
}

export function computeStratifiedMeanEstimate(
    rows: Array<Record<string, unknown>>,
    stratifyBy: string | undefined,
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
    field: string,
) {
    return computeStratifiedValueEstimate(rows, stratifyBy, layers, totalPopulation, fieldAccessor(field));
}

export function computeStratifiedValueSe(
    population: Array<Record<string, unknown>>,
    stratifyBy: string | undefined,
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
    accessor: NumericAccessor,
) {
    if (!stratifyBy || !hasCompleteStratifiedDesign(layers, totalPopulation)) {
        return null;
    }

    let variance = 0;

    for (const layer of layers) {
        const populationValues = population
            .filter((row) => stratumKey(row[stratifyBy]) === stratumKey(layer.name))
            .map((row) => accessor(row))
            .filter((value): value is number => value !== null);

        if (populationValues.length !== layer.count) {
            return null;
        }

        const layerMean = populationValues.reduce((sum, value) => sum + value, 0) / populationValues.length;
        const layerVariance = populationValues.length > 1
            ? populationValues.reduce((sum, value) => sum + (value - layerMean) ** 2, 0) / (populationValues.length - 1)
            : 0;

        const weight = layer.count / totalPopulation;
        const finiteCorrection = Math.max(0, 1 - (layer.sampleCount / layer.count));
        variance += weight * weight * finiteCorrection * layerVariance / layer.sampleCount;
    }

    return Math.sqrt(variance);
}

export function computeStratifiedMeanSe(
    population: Array<Record<string, unknown>>,
    stratifyBy: string | undefined,
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
    field: string,
) {
    return computeStratifiedValueSe(population, stratifyBy, layers, totalPopulation, fieldAccessor(field));
}

export function computeStratifiedDistributionEstimate(
    rows: Array<Record<string, unknown>>,
    field: string,
    stratifyBy: string | undefined,
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
) {
    if (!stratifyBy || !hasCompleteStratifiedDesign(layers, totalPopulation)) {
        return {};
    }

    const distribution = createSafeRecord<number>();

    for (const layer of layers) {
        const layerRows = rows.filter((row) => stratumKey(row[stratifyBy]) === stratumKey(layer.name));
        if (layerRows.length !== layer.sampleCount) {
            return {};
        }

        const layerDistribution = estimateSimpleDistribution(layerRows, field);
        const weight = layer.count / totalPopulation;
        for (const [category, proportion] of Object.entries(layerDistribution)) {
            distribution[category] = (distribution[category] || 0) + weight * proportion;
        }
    }

    return distribution;
}
