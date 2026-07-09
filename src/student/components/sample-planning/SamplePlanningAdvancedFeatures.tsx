import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ADVANCED_TAB_CONFIG, type AdvancedTab } from "./advancedTabs";

export interface SamplePlanningAdvancedFeaturesProps {
    activeAdvancedTab: AdvancedTab | null;
    onAdvancedTabChange: (tab: AdvancedTab) => void;
}

export function SamplePlanningAdvancedFeatures({
    activeAdvancedTab,
    onAdvancedTabChange,
}: SamplePlanningAdvancedFeaturesProps) {
    return (
        <Card
            className="rounded-2xl border-border bg-card/50 shadow-sm"
            data-testid="student-sample-plan-advanced-features"
        >
            <CardHeader className="pb-2">
                <CardTitle className="text-base text-foreground">高级功能</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-2">
                    {ADVANCED_TAB_CONFIG.map(({ key, label, activeClass }) => (
                        <Button
                            key={key}
                            variant="outline"
                            size="sm"
                            onClick={() => onAdvancedTabChange(key)}
                            className={`h-auto py-2 text-xs ${
                                activeAdvancedTab === key
                                    ? activeClass
                                    : "border-input text-foreground/90 hover:bg-card"
                            }`}
                        >
                            {label}
                        </Button>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
