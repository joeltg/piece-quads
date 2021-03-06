import RDF from "rdf-js"
import varint from "varint"

import decodeHeader from "./decodeHeader.js"
import { sortTuples, version } from "./utils.js"

type Q = [number, number, number, number]

export default function decode(
	data: Buffer,
	DataFactory: RDF.DataFactory<RDF.BaseQuad, RDF.BaseQuad>,
	options?: { isNormalized?: boolean }
): RDF.BaseQuad[] {
	const isNormalized = !!options?.isNormalized

	const v = varint.decode(data)
	if (v !== version) {
		throw new Error(`Invalid version number ${v}`)
	}
	let offset = varint.encodingLength(v)
	const result = decodeHeader(data, offset, DataFactory, isNormalized)
	offset = result.offset

	const quads = Array.from(unpack(data, offset, [], [], Infinity))
	if (isNormalized) {
		quads.sort(sortTuples)
	}

	const header = [...result.NamedNode, ...result.Literal, ...result.BlankNode]
	return quads.map((quad) => toQuad(quad, DataFactory, header))
}

function* unpack(
	data: Buffer,
	offset: number,
	trace: number[],
	values: number[],
	total: number
): Generator<Q, number, undefined> {
	const mod = 4 - trace.length
	let yieldCount = 0
	if (trace.length < 3) {
		let token = varint.decode(data, offset)
		offset += varint.encodingLength(token)
		while (token !== 0) {
			const position = token % mod
			const count = (token - position) / mod
			yieldCount += count
			const id = varint.decode(data, offset)
			offset += varint.encodingLength(id)

			trace.push(position)
			values.push(id)
			offset = yield* unpack(data, offset, trace, values, count)
			values.pop()
			trace.pop()
			token = varint.decode(data, offset)
			offset += varint.encodingLength(token)
		}
	}

	const previous: number[] = new Array(mod).fill(0)
	for (; yieldCount < total && offset < data.length; yieldCount++) {
		let same = true
		const tuple: number[] = new Array(mod).fill(0)
		for (const [i, p] of previous.entries()) {
			const delta = varint.decode(data, offset)
			offset += varint.encodingLength(delta)
			tuple[i] = same ? p + delta : delta
			previous[i] = tuple[i]
			same = same && delta === 0
		}
		unProject(tuple, trace, values)
		yield tuple as Q
	}

	return offset
}

function unProject(tuple: number[], trace: number[], values: number[]) {
	while (tuple.length < 4) {
		const i = 4 - tuple.length - 1
		const value = values[i]
		const position = trace[i]
		if (position === tuple.length) {
			tuple.push(value)
		} else {
			for (let j = 0; j < position; j++) {
				tuple.unshift(tuple.pop()!)
			}
			tuple.splice(position, 0, value)
		}
	}
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
