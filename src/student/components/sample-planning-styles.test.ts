import { expect, test } from "bun:test";
import { primarySliderClassName } from "./sample-planning-styles";

test("sample-planning sliders keep their filled range distinct from the track", () => {
    expect(primarySliderClassName).toContain("[&_[data-slot=slider-range]]:!bg-primary");
    expect(primarySliderClassName).toContain("[&_[data-slot=slider-track]]:!bg-primary/15");
    expect(primarySliderClassName).not.toContain("[&_[data-slot=slider-track]]:!bg-primary ");
});
