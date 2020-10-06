/// <reference types="node" />
import RDF from "rdf-js";
export declare type DecodeResult = {
    readonly offset: number;
    readonly NamedNode: RDF.NamedNode[];
    readonly Literal: RDF.Literal[];
    readonly BlankNode: RDF.BlankNode[];
};
export default function decodeHeader(data: Buffer, offset: number, DataFactory: RDF.DataFactory<RDF.BaseQuad, RDF.BaseQuad>, isNormalized: boolean): DecodeResult;
