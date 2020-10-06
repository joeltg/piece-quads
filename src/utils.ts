export function sortTuples(a: number[], b: number[]): -1 | 0 | 1 {
	for (let i = 0; i < a.length && i < b.length; i++) {
		if (a[i] < b[i]) {
			return -1
		} else if (b[i] < a[i]) {
			return 1
		}
	}
	return 0
}

export const version = 0x21
