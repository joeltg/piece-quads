import varint from "varint";
import decodeHeader from "./decodeHeader.js";
export default function decode(data, DataFactory, options) {
    const isNormalized = !!options?.isNormalized;
    const headerLength = varint.decode(data);
    let offset = varint.encodingLength(headerLength);
    const headerBuffer = data.slice(offset, offset + headerLength);
    const header = decodeHeader(headerBuffer, DataFactory, isNormalized);
    offset += headerLength;
    const total = varint.decode(data, offset);
    offset += varint.encodingLength(total);
    const unpacked = Array.from(unpack(data, offset, [NaN, NaN, NaN, NaN], 4, total));
    if (isNormalized) {
        unpacked.sort(sortQuads);
    }
    return unpacked.map((quad) => toQuad(quad, DataFactory, header));
}
function* unpack(data, offset, pivots, depth, total) {
    let yieldCount = 0;
    if (depth > 1) {
        let token = varint.decode(data, offset);
        offset += varint.encodingLength(token);
        while (token !== 0) {
            const position = token % 4;
            const count = (token - position) / 4;
            yieldCount += count;
            const id = varint.decode(data, offset);
            offset += varint.encodingLength(id);
            pivots[position] = id;
            offset = yield* unpack(data, offset, pivots, depth - 1, count);
            pivots[position] = NaN;
            token = varint.decode(data, offset);
            offset += varint.encodingLength(token);
        }
    }
    const previous = [0, 0, 0, 0];
    for (; yieldCount < total && offset < data.length; yieldCount++) {
        const q = new Array(4);
        let same = true;
        for (const [i, t] of pivots.entries()) {
            if (isNaN(t)) {
                q[i] = varint.decode(data, offset);
                offset += varint.encodingLength(q[i]);
                if (same) {
                    same = q[i] === 0;
                    q[i] += previous[i];
                }
                previous[i] = q[i];
            }
            else {
                q[i] = t;
            }
        }
        yield q;
    }
    return offset;
}
function toQuad(quad, DataFactory, header) {
    return DataFactory.quad(toTerm(quad[0], DataFactory, header), toTerm(quad[1], DataFactory, header), toTerm(quad[2], DataFactory, header), toTerm(quad[3], DataFactory, header));
}
function toTerm(term, DataFactory, header) {
    return term === 0 ? DataFactory.defaultGraph() : header[term - 1];
}
function sortQuads(a, b) {
    if (a[0] === b[0]) {
        if (a[1] === b[1]) {
            if (a[2] === b[2]) {
                return a[3] < b[3] ? -1 : 1;
            }
            else {
                return a[2] < b[2] ? -1 : 1;
            }
        }
        else {
            return a[1] < b[1] ? -1 : 1;
        }
    }
    else {
        return a[0] < b[0] ? -1 : 1;
    }
}
//# sourceMappingURL=decode.js.map