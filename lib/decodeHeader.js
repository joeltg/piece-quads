import varint from "varint";
export default function decodeHeader(data, offset, DataFactory, isNormalized) {
    const decoder = new TextDecoder();
    const result = {
        NamedNode: [],
        Literal: [],
        BlankNode: [],
    };
    // IRIs
    for (;;) {
        const length = varint.decode(data, offset);
        offset += varint.encodingLength(length);
        if (length === 0) {
            break;
        }
        else {
            const value = decoder.decode(data.slice(offset, offset + length));
            result.NamedNode.push(DataFactory.namedNode(value));
            offset += length;
        }
    }
    // Literals
    for (;;) {
        const token = varint.decode(data, offset);
        offset += varint.encodingLength(token);
        if (token === 0) {
            break;
        }
        else if (token === 1) {
            const length = varint.decode(data, offset);
            offset += varint.encodingLength(token);
            const value = decoder.decode(data.slice(offset, offset + length));
            result.Literal.push(DataFactory.literal(value));
            offset += length;
        }
        else if (token % 2 === 0) {
            const index = token / 2 - 1;
            if (index < result.NamedNode.length) {
                const datatype = result.NamedNode[index];
                const length = varint.decode(data, offset);
                offset += varint.encodingLength(token);
                const value = decoder.decode(data.slice(offset, offset + length));
                result.Literal.push(DataFactory.literal(value, datatype));
                offset += length;
            }
            else {
                throw new Error("Invalid literal datatype reference");
            }
        }
        else {
            const languageLength = (token + 1) / 2;
            const langauge = decoder.decode(data.slice(offset, offset + languageLength));
            offset += languageLength;
            const length = varint.decode(data, offset);
            offset += varint.encodingLength(token);
            const value = decoder.decode(data.slice(offset, offset + length));
            result.Literal.push(DataFactory.literal(value, langauge));
            offset += length;
        }
    }
    // Blank nodes
    const blankNodeCount = varint.decode(data, offset);
    offset += varint.encodingLength(blankNodeCount);
    const prefix = isNormalized ? "c14n" : "b";
    for (let i = 0; i < blankNodeCount; i++) {
        result.BlankNode.push(DataFactory.blankNode(prefix + i.toString()));
    }
    if (isNormalized) {
        result.BlankNode.sort(({ value: a }, { value: b }) => a < b ? -1 : b < a ? 1 : 0);
    }
    return Object.freeze({ offset, ...result });
}
//# sourceMappingURL=decodeHeader.js.map