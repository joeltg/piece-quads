import RDF from "rdf-js"
import varint from "varint"

export default function decodeHeader(
	data: Buffer,
	DataFactory: RDF.DataFactory<RDF.BaseQuad, RDF.BaseQuad>,
	isNormalized: boolean
): RDF.Term[] {
	const entries: { value: string; token: null | string | number }[] = []
	const decoder = new TextDecoder()
	const blankNodeLength = varint.decode(data)
	let offset = varint.encodingLength(blankNodeLength)
	while (offset < data.length) {
		const valueSizeToken = varint.decode(data, offset)
		offset += varint.encodingLength(valueSizeToken)
		const residue = valueSizeToken % 2
		const valueSize = (valueSizeToken - residue) / 2
		if (residue === 1) {
			const value = decoder.decode(data.slice(offset, offset + valueSize))
			offset += valueSize
			const entry = { value, token: null }
			entries.push(entry)
		} else {
			const value = decoder.decode(data.slice(offset, offset + valueSize))
			offset += valueSize
			const typeToken = varint.decode(data, offset)
			offset += varint.encodingLength(typeToken)
			const tokenResidue = typeToken % 2
			const token = (typeToken - tokenResidue) / 2
			if (tokenResidue === 1) {
				const language = decoder.decode(data.slice(offset, offset + token))
				offset += token
				const entry = { value, token: language }
				entries.push(entry)
			} else {
				const entry = { value, token }
				entries.push(entry)
			}
		}
	}

	const header: RDF.Term[] = new Array(entries.length)
	for (const [index, { value, token }] of entries.entries()) {
		if (token === null) {
			header[index] = DataFactory.namedNode(value)
		}
	}

	for (const [index, { value, token }] of entries.entries()) {
		if (token === null) {
			continue
		} else if (token === 0) {
			header[index] = DataFactory.literal(value)
		} else if (typeof token === "number") {
			const datatype = header[token - 1]
			if (datatype !== undefined && datatype.termType === "NamedNode") {
				header[index] = DataFactory.literal(value, datatype)
			} else {
				throw new Error(`Invalid header reference ${token}`)
			}
		} else if (typeof token === "string") {
			header[index] = DataFactory.literal(value, token)
		} else {
			throw new Error("Invalid token")
		}
	}

	const prefix = isNormalized ? "c14n" : "b"
	const blankNodes = new Array(blankNodeLength)
	for (let i = 0; i < blankNodeLength; i++) {
		blankNodes[i] = DataFactory.blankNode(prefix + i.toString())
	}

	if (isNormalized) {
		blankNodes.sort(({ value: a }, { value: b }) =>
			a < b ? -1 : b < a ? 1 : 0
		)
	}

	return header.concat(blankNodes)
}
