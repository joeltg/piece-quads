export function sortTuples(a, b) {
    for (let i = 0; i < a.length && i < b.length; i++) {
        if (a[i] < b[i]) {
            return -1;
        }
        else if (b[i] < a[i]) {
            return 1;
        }
    }
    return 0;
}
export const version = 0x21;
//# sourceMappingURL=utils.js.map