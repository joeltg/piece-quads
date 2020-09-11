import RDF from "rdf-js"
import varint from "varint"

import decodeHeader from "./decodeHeader.js"

type Q = [number, number, number, number]

export default function decode(
	data: Buffer,
	DataFactory: RDF.DataFactory<RDF.BaseQuad, RDF.BaseQuad>,
	options?: { isNormalized?: boolean }
): RDF.BaseQuad[] {
	const isNormalized = !!options?.isNormalized
	const headerLength = varint.decode(data)
	let offset = varint.encodingLength(headerLength)
	const headerBuffer = data.slice(offset, offset + headerLength)
	const header = decodeHeader(headerBuffer, DataFactory, isNormalized)
	offset += headerLength
	const total = varint.decode(data, offset)
	offset += varint.encodingLength(total)
	const unpacked = Array.from(
		unpack(data, offset, [NaN, NaN, NaN, NaN], 4, total)
	)
	if (isNormalized) {
		unpacked.sort(sortQuads)
	}
	return unpacked.map((quad) => toQuad(quad, DataFactory, header))
}

function* unpack(
	data: Buffer,
	offset: number,
	pivots: Q,
	depth: number,
	total: number
): Generator<Q, number, undefined> {
	let yieldCount = 0
	if (depth > 1) {
		let token = varint.decode(data, offset)
		offset += varint.encodingLength(token)
		while (token !== 0) {
			const position = token % 4
			const count = (token - position) / 4
			yieldCount += count
			const id = varint.decode(data, offset)
			offset += varint.encodingLength(id)
			pivots[position] = id
			offset = yield* unpack(data, offset, pivots, depth - 1, count)

			pivots[position] = NaN
			token = varint.decode(data, offset)
			offset += varint.encodingLength(token)
		}
	}

	const previous: Q = [0, 0, 0, 0]
	for (; yieldCount < total && offset < data.length; yieldCount++) {
		const q = new Array(4) as Q
		let same = true
		for (const [i, t] of pivots.entries()) {
			if (isNaN(t)) {
				q[i] = varint.decode(data, offset)
				offset += varint.encodingLength(q[i])
				if (same) {
					same = q[i] === 0
					q[i] += previous[i]
				}
				previous[i] = q[i]
			} else {
				q[i] = t
			}
		}
		yield q
	}

	return offset
}

function toQuad(
	quad: Q,
	DataFactory: RDF.DataFactory<RDF.BaseQuad, RDF.BaseQuad>,
	header: RDF.Term[]
): RDF.BaseQuad {
	return DataFactory.quad(
		toTerm(quad[0], DataFactory, header),
		toTerm(quad[1], DataFactory, header),
		toTerm(quad[2], DataFactory, header),
		toTerm(quad[3], DataFactory, header)
	)
}

function toTerm(
	term: number,
	DataFactory: RDF.DataFactory<RDF.BaseQuad, RDF.BaseQuad>,
	header: RDF.Term[]
) {
	return term === 0 ? DataFactory.defaultGraph() : header[term - 1]
}

function sortQuads(a: Q, b: Q) {
	if (a[0] === b[0]) {
		if (a[1] === b[1]) {
			if (a[2] === b[2]) {
				return a[3] < b[3] ? -1 : 1
			} else {
				return a[2] < b[2] ? -1 : 1
			}
		} else {
			return a[1] < b[1] ? -1 : 1
		}
	} else {
		return a[0] < b[0] ? -1 : 1
	}
}
