import RDF from "rdf-js"
import { Buffer } from "buffer"
import varint from "varint"

export const xsdString = "http://www.w3.org/2001/XMLSchema#string"

export default function encodeHeader(terms: RDF.Term[]): Buffer {
	const encoder = new TextEncoder()

	const namedNodeIndices: Map<string, number> = new Map()
	let i = NaN
	for (const [index, term] of terms.entries()) {
		if (isNaN(i) && term.termType === "BlankNode") {
			i = index
		} else if (term.termType === "NamedNode") {
			namedNodeIndices.set(term.value, index + 1)
		}
	}

	const header: Uint8Array[] = [
		Uint8Array.from(isNaN(i) ? [0] : varint.encode(terms.length - i)),
	]

	for (const term of terms) {
		if (term.termType === "NamedNode") {
			header.push(
				Uint8Array.from(varint.encode(term.value.length * 2 + 1)),
				encoder.encode(term.value)
			)
		} else if (term.termType === "BlankNode") {
			break
		} else if (term.termType === "Literal") {
			const data = encoder.encode(term.value)
			header.push(Uint8Array.from(varint.encode(data.length * 2)), data)
			if (term.language !== "") {
				header.push(
					Uint8Array.from(varint.encode(term.language.length * 2 + 1)),
					encoder.encode(term.language)
				)
			} else if (term.datatype.value !== xsdString) {
				const index = namedNodeIndices.get(term.datatype.value)
				if (index === undefined) {
					throw new Error(
						`Could not find named node ${term.datatype.value} in header`
					)
				}
				header.push(Uint8Array.from(varint.encode(index * 2)))
			} else {
				header.push(Uint8Array.from(varint.encode(0)))
			}
		} else {
			throw new Error(`Invalid header term ${term}`)
		}
	}
	return Buffer.concat(header)
}
