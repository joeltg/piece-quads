import { Buffer } from "buffer";
import varint from "varint";
export const xsdString = "http://www.w3.org/2001/XMLSchema#string";
/**
 *
 * @param {Object} terms - The sorted array of terms
 */
export default function encodeHeader(namedNodes, literals, blankNodeCount) {
    const encoder = new TextEncoder();
    const namedNodeIndices = new Map();
    for (const [index, term] of namedNodes.entries()) {
        namedNodeIndices.set(term.value, index);
    }
    const header = [];
    for (const { value } of namedNodes) {
        header.push(new Uint8Array(varint.encode(value.length)), encoder.encode(value));
    }
    header.push(new Uint8Array([0]));
    for (const literal of literals) {
        if (literal.datatype.value === xsdString) {
            header.push(new Uint8Array([1]));
        }
        else if (literal.language !== "") {
            if (literal.language.length < 2) {
                throw new Error(`Invalid literal language tag: ${literal.language}`);
            }
            const token = literal.language.length * 2 - 1;
            header.push(new Uint8Array(varint.encode(token)), encoder.encode(literal.language));
        }
        else {
            const index = namedNodeIndices.get(literal.datatype.value);
            if (index === undefined) {
                throw new Error(`Could not find literal datatype in named node array: ${literal.datatype.value}`);
            }
            const token = (index + 1) * 2;
            header.push(new Uint8Array(varint.encode(token)));
        }
        header.push(new Uint8Array(varint.encode(literal.value.length)), encoder.encode(literal.value));
    }
    header.push(new Uint8Array([0]), new Uint8Array(varint.encode(blankNodeCount)));
    return Buffer.concat(header);
}
//# sourceMappingURL=encodeHeader.js.map