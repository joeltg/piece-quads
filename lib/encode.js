import { Buffer } from "buffer";
import varint from "varint";
import encodeHeader, { xsdString } from "./encodeHeader.js";
const blankNodePattern = /^c14n(0|[1-9][0-9]*)$/;
export default function encode(dataset) {
    const terms = new Map();
    for (const { subject, predicate, object, graph } of dataset) {
        populateURIs(subject, terms);
        populateURIs(predicate, terms);
        populateURIs(object, terms);
        populateURIs(graph, terms);
    }
    const keys = Array.from(terms.keys()).sort();
    const headerTerms = [];
    const headerIndices = new Map([["", 0]]);
    for (const [i, key] of keys.entries()) {
        headerIndices.set(key, i + 1);
        headerTerms.push(terms.get(key));
    }
    const headerBuffer = encodeHeader(headerTerms);
    const buffer = [
        Uint8Array.from(varint.encode(headerBuffer.length)),
        headerBuffer,
    ];
    const matrix = [];
    for (const quad of dataset) {
        matrix.push([
            headerIndices.get(toId(quad.subject)),
            headerIndices.get(toId(quad.predicate)),
            headerIndices.get(toId(quad.object)),
            headerIndices.get(toId(quad.graph)),
        ]);
    }
    const body = Uint8Array.from(packQuads(matrix));
    buffer.push(body);
    return Buffer.concat(buffer);
}
const match = (quad, pivots) => pivots.every((pivot, i) => isNaN(pivot) || quad[i] === pivot);
const threshhold = 2;
function findTree(quads, pivots, min) {
    const frequency = new Map();
    let maxCount = min;
    let maxTerm = NaN;
    let maxPosition = NaN;
    for (const quad of quads) {
        for (const [i, t] of quad.entries()) {
            if (!isNaN(pivots[i])) {
                continue;
            }
            const row = frequency.get(t);
            if (row === undefined) {
                const newRow = pivots.map((n, j) => isNaN(n) ? (j === i ? 1 : 0) : NaN);
                frequency.set(t, newRow);
            }
            else {
                row[i]++;
                if (row[i] > maxCount) {
                    maxCount = row[i];
                    maxTerm = t;
                    maxPosition = i;
                }
            }
        }
    }
    if (maxCount > min) {
        return [maxCount, maxTerm, maxPosition];
    }
    return null;
}
function* pack(quads, pivots, depth) {
    if (depth > 1) {
        for (let tree = findTree(quads, pivots, threshhold); tree !== null; tree = findTree(quads, pivots, threshhold)) {
            let [count, term, position] = tree;
            yield* varint.encode(count * 4 + position);
            yield* varint.encode(term);
            // Splice the matching quads out of the matrix
            pivots[position] = term;
            const block = [];
            for (let i = 0; i < quads.length;) {
                if (match(quads[i], pivots)) {
                    block.push(...quads.splice(i, 1));
                }
                else {
                    i++;
                }
            }
            yield* pack(block, pivots, depth - 1);
            pivots[position] = NaN;
        }
        yield* varint.encode(0);
    }
    const previous = [0, 0, 0, 0];
    for (const quad of quads) {
        let different = false;
        for (const [i, pivot] of pivots.entries()) {
            if (isNaN(pivot)) {
                const delta = different ? quad[i] : quad[i] - previous[i];
                yield* varint.encode(delta);
                if (delta > 0) {
                    different = true;
                }
                previous[i] = quad[i];
            }
        }
    }
}
function* packQuads(quads) {
    const pivots = [NaN, NaN, NaN, NaN];
    yield* varint.encode(quads.length);
    yield* pack(quads, pivots, 4);
}
function populateURIs(term, terms) {
    if (term.termType === "NamedNode") {
        terms.set(toId(term), term);
    }
    else if (term.termType === "Literal") {
        terms.set(toId(term), term);
        if (term.language === "" && term.datatype.value !== xsdString) {
            terms.set(toId(term.datatype), term.datatype);
        }
    }
    else if (term.termType === "BlankNode") {
        if (blankNodePattern.test(term.value)) {
            terms.set(toId(term), term);
        }
        else {
            throw new Error(`Invalid blank node label ${term.value}. The dataset must be canonized first.`);
        }
    }
}
function toId(term) {
    if (term.termType === "NamedNode") {
        return `<${term.value}>`;
    }
    else if (term.termType === "BlankNode") {
        return `_:${term.value}`;
    }
    else if (term.termType === "DefaultGraph") {
        return "";
    }
    else if (term.termType === "Literal") {
        const value = JSON.stringify(term.value);
        if (term.datatype.value === xsdString) {
            return value;
        }
        else if (term.language) {
            return `${value}@${term.language}`;
        }
        else {
            return `${value}^^<${term.datatype.value}>`;
        }
    }
    else {
        throw new Error("Invalid term");
    }
}
//# sourceMappingURL=encode.js.map