import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
            data-testid="student-sample-plan-advanced-features"
        >
            <CardHeader className="pb-2">
                <CardTitle className="text-base">高级功能</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-2">
                    {ADVANCED_TAB_CONFIG.map(({ key, label, activeClass }) => (
                        <Button
                            key={key}
                            variant="outline"
                            size="sm"
                            onClick={() => onAdvancedTabChange(key)}
                            className={cn(
                                "h-auto py-2 text-xs",
                                activeAdvancedTab === key
                                    ? activeClass
                                    : "text-muted-foreground",
                            )}
                        >
                            {label}
                        </Button>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
