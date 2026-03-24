import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

export function PhaseNextButton({ onClick, label = "继续" }: { onClick: () => void; label?: string }) {
    return (
        <div className="flex justify-center pt-2">
            <Button
                type="button"
                onClick={onClick}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-xl shadow-lg shadow-indigo-500/20"
            >
                {label}
                <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
        </div>
    );
}
