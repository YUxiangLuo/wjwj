import * as React from "react";
import MuiAvatar from "@mui/material/Avatar";

import { cn } from "@/lib/utils";

type AvatarImageStatus = "idle" | "loaded" | "error";

const AvatarContext = React.createContext<{
  status: AvatarImageStatus;
  setStatus: (status: AvatarImageStatus) => void;
}>({
  status: "idle",
  setStatus: () => undefined,
});

function Avatar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const [status, setStatus] = React.useState<AvatarImageStatus>("idle");
  const contextValue = React.useMemo(() => ({ status, setStatus }), [status]);

  return (
    <AvatarContext.Provider value={contextValue}>
      <MuiAvatar
        data-slot="avatar"
        className={cn(
          "relative flex size-8 shrink-0 overflow-hidden rounded-circle bg-muted text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </MuiAvatar>
    </AvatarContext.Provider>
  );
}

function AvatarImage({
  className,
  src,
  alt = "",
  onLoad,
  onError,
  ...props
}: React.ComponentProps<"img">) {
  const { status, setStatus } = React.useContext(AvatarContext);

  React.useEffect(() => {
    setStatus(src ? "idle" : "error");
  }, [src, setStatus]);

  if (!src || status === "error") return null;

  return (
    <img
      src={src}
      alt={alt}
      data-slot="avatar-image"
      onLoad={(event) => {
        setStatus("loaded");
        onLoad?.(event);
      }}
      onError={(event) => {
        setStatus("error");
        onError?.(event);
      }}
      className={cn("aspect-square size-full object-cover", status !== "loaded" && "hidden", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const { status } = React.useContext(AvatarContext);
  if (status === "loaded") return null;

  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-circle bg-muted text-label font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
