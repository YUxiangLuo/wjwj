import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

export function PhaseNextButton({ onClick, label = "继续" }: { onClick: () => void; label?: string }) {
    return (
        <div className="flex justify-center pt-2">
            <Button
                type="button"
                onClick={onClick}
                className="bg-primary hover:bg-primary-hover text-primary-foreground px-8 py-5 rounded-surface "
            >
                {label}
                <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
        </div>
    );
}
