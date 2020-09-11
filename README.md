# piece-quads

Piece Quads is a highly compressed RDF dataset format that is _complementary_ to generic compression algorithms.

## API

```typescript
export function encode(dataset: RDF.BaseQuad[]): Buffer
export function decode(
	data: Buffer,
	DataFactory: RDF.DataFactory<RDF.BaseQuad, RDF.BaseQuad>,
	options?: { isNormalized?: boolean }
): RDF.BaseQuad[]
```

If the dataset you pass to `encode` has been normalized using URDNA2015, you can decode it using `{ isNormalized: true }` to preserve blank node labels and quad ordering.

## Layered compression

Piece Quads uses techniques that are largely orthogonal to generic string compression. This means that piece-encoded datasets themselves compress well under deflate, gzip, brotli, etc.

On its own, you should expect a piece-encoded dataset to be around 8-15% the size of its normalized n-quads format. Applying deflate or brotli over the piece-encoded dataset should get you down to 0.5-2% the original size. For reference, simply gzipping a normalized n-quads file will give you something around 3-4%; piece-encoding will save 2-3x on top of this.

## Design

Piece-encoded datasets are typically around 90% header (mapping terms to varints) and 10% body (actually encoding the quads), although this depends heavily on the degree of term re-use in the dataset.

The encoding scheme doesn't preference any one quad position over any other, and searches aggresively for regularity in any permutation it can find. For example, if a hundred quads in the dataset use predicate `rdf:type`, those will be collected into a block with small (two-varint) header declaring the size, position, and id of the extracted term. This process is applied recursively to the block's remaining positions - so if 20 of the 100 quads also share the same object, that object will be extracted into its own block header, and so on. Varints and delta-encoding are used throughout.

## File extension

Use the `.pq` extension if you need to.

Piece Quads is heavily inspired by [ZDAG](https://github.com/mikeal/ZDAG/).
