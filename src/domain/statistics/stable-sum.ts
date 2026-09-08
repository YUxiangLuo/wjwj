/** Neumaier summation also retains small terms when a large term is removed. */
export class StableSum {
    private sum = 0;
    private correction = 0;

    add(value: number) {
        const next = this.sum + value;
        this.correction += Math.abs(this.sum) >= Math.abs(value)
            ? (this.sum - next) + value
            : (value - next) + this.sum;
        this.sum = next;
    }

    get value() { return this.sum + this.correction; }
}
