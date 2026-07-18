interface ObservedVersionFailure {
    ok: false;
    code: "VALIDATION_ERROR" | "VERSION_CONFLICT";
    message: string;
    status: 400 | 409;
}

interface ObservedVersionSuccess {
    ok: true;
    value: number;
}

export function validateObservedVersion(
    value: unknown,
    currentVersion: number,
    options: { allowOlder?: boolean } = {},
): ObservedVersionFailure | ObservedVersionSuccess {
    if (!Number.isSafeInteger(value) || Number(value) < 1) {
        return {
            ok: false,
            code: "VALIDATION_ERROR",
            message: "observedVersion 必须是正整数",
            status: 400,
        };
    }

    const observedVersion = Number(value);
    const isAllowedOlderVersion = options.allowOlder === true && observedVersion < currentVersion;
    if (observedVersion !== currentVersion && !isAllowedOlderVersion) {
        return {
            ok: false,
            code: "VERSION_CONFLICT",
            message: "记录已发生变化，请刷新后重试",
            status: 409,
        };
    }

    return { ok: true, value: observedVersion };
}
