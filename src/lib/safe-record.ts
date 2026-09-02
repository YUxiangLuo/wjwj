/**
 * Create a string-keyed dictionary without Object.prototype.
 *
 * Population data is user controlled, so category names such as `__proto__`
 * and `constructor` must behave like ordinary keys instead of mutating or
 * reading the dictionary prototype.
 */
export function createSafeRecord<T>(): Record<string, T> {
    return Object.create(null) as Record<string, T>;
}
