/// <reference types="node" />
import RDF from "rdf-js";
export declare const xsdString = "http://www.w3.org/2001/XMLSchema#string";
/**
 *
 * @param {Object} terms - The sorted array of terms
 */
export default function encodeHeader(namedNodes: RDF.NamedNode[], literals: RDF.Literal[], blankNodeCount: number): Buffer;
