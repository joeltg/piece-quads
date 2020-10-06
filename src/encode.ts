import RDF from "rdf-js"
import { Buffer } from "buffer"
import varint from "varint"

import { sortTuples, version } from "./utils.js"

import encodeHeader, { xsdString } from "./encodeHeader.js"

type IDs = Readonly<{
	NamedNode: Map<string, RDF.NamedNode>
	Literal: Map<string, RDF.Literal>
	BlankNode: Map<string, RDF.BlankNode>
}>

export default function encode(dataset: RDF.BaseQuad[]): Buffer {
	const ids: IDs = {
		NamedNode: new Map(),
		Literal: new Map(),
		BlankNode: new Map(),
	}

	for (const { subject, predicate, object, graph } of dataset) {
		populateIDs(subject, ids)
		populateIDs(predicate, ids)
		populateIDs(object, ids)
		populateIDs(graph, ids)
	}

	const namedNodes = Array.from(ids.NamedNode)
		.sort(([a], [b]) => (a < b ? -1 : b < a ? 1 : 0))
		.map(([{}, term]) => term)

	const literals = Array.from(ids.Literal)
		.sort(([a], [b]) => (a < b ? -1 : b < a ? 1 : 0))
		.map(([{}, term]) => term)

	const buffer: Uint8Array[] = [
		new Uint8Array([version]),
		encodeHeader(namedNodes, literals, ids.BlankNode.size),
	]

	const indices: Map<string, number> = new Map([["", 0]])
	const blankNodes = Array.from(
		ids.BlankNode.values()
	).sort(({ value: a }, { value: b }) => (a < b ? -1 : b < a ? 1 : 0))
	const terms = [...namedNodes, ...literals, ...blankNodes]
	for (const [i, term] of terms.entries()) {
		indices.set(toId(term), i + 1)
	}

	const matrix: number[][] = []
	for (const quad of dataset) {
		matrix.push([
			indices.get(toId(quad.subject))!,
			indices.get(toId(quad.predicate))!,
			indices.get(toId(quad.object))!,
			indices.get(toId(quad.graph))!,
		])
	}

	buffer.push(Uint8Array.from(pack(matrix, [])))
	return Buffer.concat(buffer)
}

function getHeatMap(
	trace: number[],
	quads: number[][]
): Map<number, Array<Set<number>>> {
	const map: Map<number, Array<Set<number>>> = new Map()
	for (const [i, quad] of quads.entries()) {
		for (const [j, t] of quad.entries()) {
			const m = map.get(t)
			if (m === undefined) {
				const array = new Array(4 - trace.length)
				map.set(
					t,
					array.fill(undefined).map((_, k) => new Set(k === j ? [i] : []))
				)
			} else {
				m[j].add(i)
			}
		}
	}
	return map
}

function project(quad: number[], position: number) {
	quad.splice(position, 1)
	if (position < quad.length) {
		for (let i = 0; i < position; i++) {
			quad.push(quad.shift()!)
		}
	}
}

function* pack(
	quads: number[][],
	trace: number[]
): Generator<number, void, undefined> {
	if (trace.length < 3) {
		const heatMap = getHeatMap(trace, quads)
		for (
			let tree = findTree(heatMap, threshhold);
			tree !== null;
			tree = findTree(heatMap, threshhold)
		) {
			const { count, term, position } = tree
			const indices = heatMap.get(term)![position]
			const nMinusOneQuads: number[][] = []
			for (const index of indices) {
				const quad = quads[index]
				if (quad[position] !== term) {
					throw new Error("Internal error")
				}
				for (const [j, id] of quad.entries()) {
					const entry = heatMap.get(id)!
					entry[j].delete(index)
				}
				project(quad, position)
				nMinusOneQuads.push(quad)
				delete quads[index]
			}

			nMinusOneQuads.sort(sortTuples)

			yield* varint.encode(count * (4 - trace.length) + position)
			yield* varint.encode(term)

			trace.push(position)
			yield* pack(nMinusOneQuads, trace)
			trace.pop()
		}
		yield* varint.encode(0)
	}

	const previous: number[] = new Array(4 - trace.length).fill(0)
	for (const quad of quads) {
		if (quad === undefined) {
			continue
		}
		let same = true
		for (const [i, p] of previous.entries()) {
			const delta: number = same ? quad[i] - p : quad[i]
			yield* varint.encode(delta)
			same = same && quad[i] === p
			previous[i] = quad[i]
		}
	}
}

const threshhold = 2

function findTree(
	heatMap: Map<number, Array<Set<number>>>,
	min: number
): null | { count: number; term: number; position: number } {
	const result = { count: min, term: NaN, position: NaN }
	for (const [id, pivot] of heatMap) {
		for (const [i, indices] of pivot.entries()) {
			if (indices.size > result.count) {
				result.count = indices.size
				result.term = id
				result.position = i
			}
		}
	}

	return result.count > min ? result : null
}

function populateIDs(term: RDF.Term, ids: IDs) {
	if (term.termType === "NamedNode") {
		ids.NamedNode.set(toId(term), term)
	} else if (term.termType === "Literal") {
		ids.Literal.set(toId(term), term)
		if (term.language === "" && term.datatype.value !== xsdString) {
			ids.NamedNode.set(toId(term.datatype), term.datatype)
		}
	} else if (term.termType === "BlankNode") {
		ids.BlankNode.set(toId(term), term)
	}
}

function toId(term: RDF.Term): string {
	if (term.termType === "NamedNode") {
		return `<${term.value}>`
	} else if (term.termType === "BlankNode") {
		return `_:${term.value}`
	} else if (term.termType === "DefaultGraph") {
		return ""
	} else if (term.termType === "Literal") {
		const value = JSON.stringify(term.value)
		if (term.datatype.value === xsdString) {
			return value
		} else if (term.language) {
			return `${value}@${term.language}`
		} else {
			return `${value}^^<${term.datatype.value}>`
		}
	} else {
		throw new Error("Invalid term")
	}
}
