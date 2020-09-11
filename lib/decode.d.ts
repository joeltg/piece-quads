/// <reference types="node" />
import RDF from "rdf-js";
export default function decode(data: Buffer, DataFactory: RDF.DataFactory<RDF.BaseQuad, RDF.BaseQuad>, options?: {
    isNormalized?: boolean;
}): RDF.BaseQuad[];
