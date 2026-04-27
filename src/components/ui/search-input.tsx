import * as React from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchInputProps = React.ComponentProps<typeof Input> & {
    inputClassName?: string;
};

function SearchInput({ className, inputClassName, disabled, type = "search", ...props }: SearchInputProps) {
    return (
        <div data-slot="search-input" className={cn("relative h-10 w-full min-w-0", className)}>
            <Search className="pointer-events-none absolute left-0 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
                type={type}
                data-slot="search-input-control"
                disabled={disabled}
                className={cn("h-full pl-6", inputClassName)}
                {...props}
            />
        </div>
    );
}

export { SearchInput };
