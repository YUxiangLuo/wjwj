interface SkipLinkProps {
    targetId?: string;
}

export function SkipLink({ targetId = "main-content" }: SkipLinkProps) {
    return (
        <a
            href={`#${targetId}`}
            className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-floating transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
            跳到主要内容
        </a>
    );
}
