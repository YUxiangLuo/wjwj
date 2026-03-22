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
            className="rounded-2xl border-slate-200 bg-slate-50/50 shadow-sm dark:border-slate-800 dark:bg-slate-900/50"
            data-testid="student-sample-plan-advanced-features"
        >
            <CardHeader className="pb-2">
                <CardTitle className="text-base text-slate-800 dark:text-slate-200">高级功能</CardTitle>
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
                                    : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
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
