/// <reference types="node" />
import RDF from "rdf-js";
export default function decodeHeader(data: Buffer, DataFactory: RDF.DataFactory<RDF.BaseQuad, RDF.BaseQuad>, isNormalized: boolean): RDF.Term[];
