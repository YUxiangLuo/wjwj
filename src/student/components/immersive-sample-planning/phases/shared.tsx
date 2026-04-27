import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

export function PhaseNextButton({ onClick, label = "继续" }: { onClick: () => void; label?: string }) {
    return (
        <div className="flex justify-center pt-2">
            <Button
                type="button"
                onClick={onClick}
                size="lg"
                className="rounded-xl px-8 shadow-lg shadow-primary/20"
            >
                {label}
                <ChevronRight data-icon="inline-end" />
            </Button>
        </div>
    );
}
