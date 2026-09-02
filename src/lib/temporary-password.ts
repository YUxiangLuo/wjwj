const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%";
const ALL = `${UPPER}${LOWER}${DIGITS}${SYMBOLS}`;

function randomCharacter(alphabet: string) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0]!;
    return alphabet[value % alphabet.length]!;
}

/** Generate a readable, policy-compliant one-time password without ambiguous glyphs. */
export function generateTemporaryPassword(length = 12) {
    const targetLength = Math.max(12, Math.floor(length));
    const characters = [
        randomCharacter(UPPER),
        randomCharacter(LOWER),
        randomCharacter(DIGITS),
        randomCharacter(SYMBOLS),
        ...Array.from({ length: targetLength - 4 }, () => randomCharacter(ALL)),
    ];
    for (let index = characters.length - 1; index > 0; index -= 1) {
        const random = crypto.getRandomValues(new Uint32Array(1))[0]! % (index + 1);
        [characters[index], characters[random]] = [characters[random]!, characters[index]!];
    }
    return characters.join("");
}
