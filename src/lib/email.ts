const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

export function isValidEmail(value: string) {
    return EMAIL_PATTERN.test(value.trim());
}

export function isValidOptionalEmail(value: string) {
    return !value.trim() || isValidEmail(value);
}
