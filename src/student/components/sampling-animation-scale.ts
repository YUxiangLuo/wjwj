import { allocateStratifiedSampleCounts } from "./stratified-allocation";

export const MAX_VISUAL_POPULATION = 1000;
export const MAX_VISUAL_GRID_COLUMNS = 40;

export interface SamplingAnimationScale {
    population: number;
    sample: number;
    gridColumns: number;
    gridRows: number;
    compressed: boolean;
}

/**
 * Small frames are drawn one unit per dot. Large frames are compressed while
 * retaining the sampling fraction, so the animation never invents population
 * units and a census still highlights every visible dot.
 */
export function buildSamplingAnimationScale(populationSize: number, sampleSize: number): SamplingAnimationScale {
    const actualPopulation = Number.isFinite(populationSize) ? Math.max(0, Math.floor(populationSize)) : 0;
    const actualSample = Number.isFinite(sampleSize)
        ? Math.min(actualPopulation, Math.max(0, Math.floor(sampleSize)))
        : 0;
    const population = Math.min(actualPopulation, MAX_VISUAL_POPULATION);
    const compressed = population < actualPopulation;
    const sample = actualSample === 0 || population === 0
        ? 0
        : compressed
            ? Math.min(population, Math.max(1, Math.round(actualSample / actualPopulation * population)))
            : actualSample;
    const gridColumns = population === 0
        ? 1
        : Math.min(MAX_VISUAL_GRID_COLUMNS, Math.max(1, Math.ceil(Math.sqrt(population * 1.6))));

    return {
        population,
        sample,
        gridColumns,
        gridRows: Math.max(1, Math.ceil(population / gridColumns)),
        compressed,
    };
}

export function buildStratifiedVisualAllocation(
    layers: Array<{ count: number; sampleCount: number }>,
    visualPopulation: number,
    visualSample: number,
) {
    const population = allocateStratifiedSampleCounts({
        targetSampleSize: visualPopulation,
        rawCounts: layers.map(layer => layer.count),
        caps: layers.map(layer => layer.count),
        minPerLayer: 0,
    });
    const sample = allocateStratifiedSampleCounts({
        targetSampleSize: visualSample,
        rawCounts: layers.map(layer => layer.sampleCount),
        caps: population,
        minPerLayer: 0,
    });
    return { population, sample };
}
