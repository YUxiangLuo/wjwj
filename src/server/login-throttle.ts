const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_IP = 30;
const MAX_ATTEMPTS_PER_ACCOUNT_AND_IP = 8;

interface Counter {
    count: number;
    resetsAt: number;
}

export class LoginAttemptThrottle {
    private readonly counters = new Map<string, Counter>();

    consume(ip: string, scope: string, identifier: string, now = Date.now()) {
        if (!ip) return true;
        const normalizedIdentifier = identifier.trim().normalize("NFKC").toLocaleLowerCase("en-US");
        return this.consumeKey(`ip:${ip}`, MAX_ATTEMPTS_PER_IP, now)
            && this.consumeKey(`account:${scope}:${ip}:${normalizedIdentifier}`, MAX_ATTEMPTS_PER_ACCOUNT_AND_IP, now);
    }

    clear(ip: string, scope: string, identifier: string) {
        if (!ip) return;
        const normalizedIdentifier = identifier.trim().normalize("NFKC").toLocaleLowerCase("en-US");
        this.counters.delete(`account:${scope}:${ip}:${normalizedIdentifier}`);
    }

    private consumeKey(key: string, limit: number, now: number) {
        const previous = this.counters.get(key);
        const counter = !previous || previous.resetsAt <= now
            ? { count: 0, resetsAt: now + WINDOW_MS }
            : previous;
        counter.count += 1;
        this.counters.set(key, counter);
        if (this.counters.size > 10_000) {
            for (const [candidate, value] of this.counters) {
                if (value.resetsAt <= now) this.counters.delete(candidate);
            }
            while (this.counters.size > 10_000) {
                const oldest = this.counters.keys().next().value as string | undefined;
                if (!oldest) break;
                this.counters.delete(oldest);
            }
        }
        return counter.count <= limit;
    }
}

export const loginAttemptThrottle = new LoginAttemptThrottle();
