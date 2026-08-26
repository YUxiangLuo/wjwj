export function reloadBfcachePage(
    event: Pick<PageTransitionEvent, "persisted">,
    reload: () => void = () => window.location.reload(),
) {
    if (event.persisted) reload();
}
