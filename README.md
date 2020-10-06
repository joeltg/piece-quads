# n-piece

_n-piece_ is a compact binary serialization format for RDF datasets that is \_complementary\_ to generic compression algorithms.

## API

```typescript
export function encode(dataset: RDF.BaseQuad[]): Buffer {}
export function decode(
	data: Buffer,
	DataFactory: RDF.DataFactory<RDF.BaseQuad, RDF.BaseQuad>,
	options?: { isNormalized?: boolean }
): RDF.BaseQuad[] {}
```

If the dataset you pass to `encode` has been normalized using `URDNA2015`, you can decode it using `{ isNormalized: true }` to preserve blank node labels and quad ordering.

## Layered compression

n-piece uses techniques that are largely orthogonal to generic string compression. This means that n-piece datasets themselves compress well under deflate, gzip, brotli, etc.

## Design

Piece-encoded datasets are typically around 90% header (mapping terms to varints) and 10% body (actually encoding the quads), although this depends heavily on the degree of term re-use in the dataset.

The encoding scheme doesn't preference any one quad position over any other, and searches aggresively for regularity in any permutation it can find. For example, if a hundred quads in the dataset use predicate `rdf:type`, those will be collected into a block with small (two-varint) header declaring the size, position, and id of the extracted term. This process is applied recursively to the block's remaining positions - so if 20 of the 100 quads also share the same object, that object will be extracted into its own block header, and so on. Varints and delta-encoding are used throughout.

## File extension

Use the `.np` extension if you need to.

n-piece is heavily inspired by [ZDAG](https://github.com/mikeal/ZDAG/).

# Format specification

```
---------------------------
| version | header | body |
---------------------------
```

This spec is written primarily from the perspective of a decoder, with an extra at the end for encoder-specific notes.

n-piece uses unsigned varints extensively using the same encoding as the [`encoding/binary` package](https://golang.org/pkg/encoding/binary/) in Go.

## Version

n-piece files begin with an unsigned varint representing the **format version**. The current format version is **`51`**, so every n-piece file in the format specified here begins with the byte `0x33`. 51 is the first version and was chosen arbitrarily.

## Header

The header is a list of every IRI and literal in the dataset. Blank nodes are not listed in the header, although the total number of unique blank nodes is listed after the end of the list of literals.

```
----------------------------------------------------------------------------
| iri1 | iri2 | ... | \0 | literal1 | literal2 | ... | \0 | blankNodeCount |
----------------------------------------------------------------------------
```

Later, in the body, terms will be represented as indices into this list. Blank nodes are also represented as indices that "overflow" the header, but do not need to be serialized since their labels are not significant.

### IRIs

The header begins by listing all the unique IRIs in the dataset, including IRIs that appear as the datatypes of literals, excluding the special-cased datatype `xsd:string`. If `xsd:string` appears in the dataset as an IRI term (ie not the datatype of literals) then it must be included, but if it only appears as a literal datatype then it must _not_ be included.

The IRIs are sorted lexicographically ascending and prefixed with a uvarint length. After the last IRI is a zero byte. If there are no IRIs in the dataset, then `\0` is the first byte after the version uvarint.

### Literals

The second part of the header encodes the literals used in the dataset. To avoid wasting bytes with escape sequences, literals are encoded using length prefixes instead of delimiters.

A literal entry begins with a uvarint `d > 0` that encodes the language-or-datatype of the literal, potentially followed by a language tag.

- if the uvarint `d > 0` is one `d == 1`, then the literal has datatype `xsd:string`.
- if the uvarint `d > 1` is even `d % 2 == 0`, then the literal has the datatype at index `(d / 2) - 1` in the IRI block of the header.
- if the uvarint `d > 2` is odd `d % 2 == 1`, then the literal has datatype `rdf:langString` and the next `(d + 1) / 2` bytes are the literal's language tag.
  - We can get away with this because all ISO 639 codes are at least two bytes long.
  - n-piece _enforces_ that the language tag is at least two bytes long.

After this there is a uvarint encoding the length in bytes of the literal's value, followed by its raw utf-8 value with no quotation or escaping of any kind.

Literals are sorted lexicographically by their N-Quads serialization, even though we don't use the N-Quads serialization in the encoding. This means that they are sorted primarily by the value, and in the rare case that different literals that have the same value, literals with datatype `xsd:string` sort first, followed by literals with language tags (ascending), followed last by literals with other datatypes (also ascending).

For example:

- `"foo" < "goo"` (sort by value first no matter what)
- `"foo" < "foo"@en` (`xsd:string` comes before language tags)
- `"foo" < "foo"^^<http://example.com/fork>` (`xsd:string` comes before other datatypes)
- `"foo"@en < "foo"^^<http://example.com/fork>` (language tags come before other datatypes)
- `"foo"@en < "foo"@fr` (sort language tags ascending)
- `"foo"^^<http://example.com/fork> < "foo"^^<http://example.com/spoon>` (sort datatypes ascending)
- `"foo"^^<http://example.com/spoon> < "goo"` (sort by value first no matter what)

After the literal entries there is a terminating zero byte.

### Blank nodes

After the `\0` byte terminating the literal section there is a uvarint `blankNodeCount` encoding the total number of blank nodes used in the dataset.

Blank nodes themselves are not listed in the header. Instead, they are referenced in the body with indices beyond the header length, "as if they existed".

The entire header section is organized so that all the terms have indices in lexicographic order of their N-Quads serialization, including blank ndoes, since the leading underscore sorts them after IRIs (`<`) and literals (`"`) (although again, the `<>` and `""` syntax for IRIs and literals is **not** used in n-piece). It's just not necessary to actually say anything about the blank nodes since their labels are insignificant.

## Body

Given an encoded header, we can now represent terms as header indices. In the body, **header indices are always 1-indexed**, i.e. the uvarint `1` deferences to the first term in the header, and the uvarint `0` is used to represent the default graph term.

### Piece tree

The body is structured as a tree of blocks called _pieces_. We refer to a piece at depth _d_ as a _(4-d)_-piece: the root is a single 4-piece, which contains zero or more 3-pieces, each of which contains zero or more 2-pieces.

Pieces are a form of component-wise deduplication. Every _n_-piece has a position _p_ and value _v_, and encodes all of the quads in its parent piece that have value _v_ in position _p_. Some of these quads are further deduplicated in child _n-1_-pieces, and the remainder can be encoded as a list of _n_-tuples.

Intuitively, we can imagine looking at a dataset and noticing that many of the quads have the same value in the same position - for example, most quads in most datasets have the default graph as their graph term. A 3-piece is a data structure that lets us say "this is a piece in position `4` (the graph term) with value `0` (the default graph)", and then encode the quads in the default graph as 3-tuples instead of quads. But pieces are also recursive, so if several of those 3-tuples shared the same subject, we could collect all of those into their own 2-piece, and so on. It's only the left-over quads that don't fit into child _(n-1)_-pieces that get encoded as _n_-tuples.

In general an _n_-piece has the structure

```
-----------------------------------------
meta | value | children | \0 | n-tuples |
-----------------------------------------
```

#### Meta

The first part of an _n_-piece is a uvarint `meta` that encodes two numbers at once: the total number of quads `t` in the piece (including sub-pieces) and the position `p`.

The range of `p` is known to be `0 <= p <= n` (we will explain this later), so we can encode both of them together as `meta = (t * (n + 1)) + p`.

#### Value

The second part of an _n_-piece is a uvarint `value` that is the value in position `p` that all the quads in the pieces share.

#### Children

After the value uvarint are zero or more _(n-1)_-pieces, followed by a terminating zero byte (every child begins with a `meta` uvarint that is always greater than zero).

As a special case, 1-pieces do **not** include the terminating zero byte, since we know beforehand that they have no children. A 1-piece is just:

```
-------------------------
meta | value | 1-tuples |
-------------------------
```

#### N-tuples

Every quad in the dataset is eventually encoded as an _n_-tuple in an _n_-piece. Some quads will be encoded as 4-tuples at the root level, others will be buried as 1-tuples inside 1-pieces inside 2-pieces inside 3-pieces.

### Rotating positions

Each time we go down a level in the piece tree, we "compress" RDF statements from _n_-tuples to _(n-1)_-tuples by deduplicating one of the term positions. But the term positions that we eliminate are not in any fixed order, in either dimension. For example, in the "horizontal" dimension, we might have a subject-position 3-piece followed a sibling object-position 3-piece. Or in the "vertical" dimension, we might have a subject-position 3-piece with a graph-position 2-piece child, or we might have a graph-position 3-piece with a predicate-position 2-piece child.

This means that in lower pieces we need to write down tuples whose components correspond to the "remaining" quad positions, and that which quad positions are remaining depend on the ancestor pieces. For example, given a quad `[4 6 1 0]`, and letting `*` indicate an "eliminated" position, we might end up needing need to project `[4 * 1 0]` onto a 3-tuple, or `[* * 1 0]` onto a 2-tuple, or any other choice of positions, all depending on the parent pieces.

How do we write `[4 * 1 0]` as a 3-tuple? The naive choice is just to "read off" the remaining positions left-to-right to get `[4 1 0]`. However the most convenient choice to practically implement is actually to rotate the entire tuple around to get `[1 0 4]`. But then what if we find that this quad actually belongs to a child 2-piece and we're really left with `[4 * 1 *]`, aka `[1 * 4]`? Well then we just rotate the 3-tuple around again to get our 2-tuple `[4 1]`. This ultimately means that when encoding and decoding the piece tree, we have to keep careful track of which positions have been "eliminated" at each level and rotate our indices accordingly.

A function that does this rotation for us is `f(x, y, n) = (y + n - x) % (n + 1)`.

Each _(4-d)_-piece at depth _d_ encodes a subset of the quads in the dataset that have _d_ terms in common. For example, each 3-piece

Given its encoded header, a dataset can now be represented as a `4 x m` matrix of uvarint indices:

```
20  2  1 83
40  2  1  0
40  9 55 83
99 12  1  0
99 12  4  0
        ...
```

where each entry is a header term index, or, if the entry is greater than or equal to the number of terms in the header, a blank node identifier. Each row is a quad, the first column is the subjects, the second is the predicates, the third is the objects, and the last is the graph terms.

Quads in n-piece are always listed in ascending cartesian order and are always delta-encoded.

### Lexicographic order

Ascending cartesian order means the first column monotonically increases, and for rows with the same entry in the first column, the second column monotonically increases, and for rows with the same entries in their first and second columns, the third column monotonically increases, and so on.

This matrix is sorted:

```
20  2  1 83
40  2  1  0
40  9 55 83
99 12  1  0
99 12  4  0
        ...
```

since `20 <= 40 <= 40 <= 99 <= 99` (subject column), `2 <= 9` (predicate column, for the two rows with subject `40`), and `1 <= 4` (for the two rows with subject `99` and predicate `12`).

### Delta encoding

Instead of directly encoding header indices, we actually encode _deltas_ of indices, like this:

```
20  2  1 83
20  2  1  0
 0  7 55 83
59 12  1  0
 0  0  3  0
        ...
```

Especially with uvarints, this ends up saving lots of space.

#### Piece encoding

The other compression technique that piece quads uses is called piece coding. A more descriptive name might be subtree elimination.

It works like this: encoders scan the dataset and look for terms that appear in the same position a lot. Suppose that we had four statements all about the same subject:

```
13  2  8  0
13  4 11  4
13  4 44  4
13  4 46  2
...
```

(notice that this matrix is also sorted!)

This is a little redundant, and it would be nice if encoders could notice this and "lift" the repeated term to a little header of its own.

```
[subject: 13]
 2  8  0
 4 11  4
 4 44  4
 4 46  2
--------
...
```

Doing this requires a little bit of overhead, so we introduce the concept of an _n-piece_ which will function as a little block all of its own.

#### n-pieces

An _n-piece_ is a block that encodes a set of `q` quads that all share the same term `a` in the same position `i`. Each n-piece starts with two header uvarints, then zero or more _(n-1)_-pieces, then a zero byte, and then the remaining quads in the set that were not encoded by any of the _(n-1)_-pieces.

A 4-piece begins with a uvarint `(q * 4) + i` that encodes both the total number `q, q > 0` of quads contained in the _n_-piece as well as the position `i, 0 <= i <= 4` of the term that is shared. The term `a` is then encoded as a uvarint header index.

After the term `a` are zero or more 3-pieces. Each 3-piece begins with a similar header that encodes the number of quads `r` in the 3-piece as well as the position `j` of the term `b` that they all have in common. However there are only three options for the position now - instead of four - since one position is already "taken" by the containing 4-piece. So instead of encoding `(r * 4) + j`, we instead encode `(r * 3) + ((j + 4 - i - 1) % 4)`.

In general, let `f(x, y, n) = ((y + n - x - 1) % n)`.

(0 + 3 - 1) % 3 = 2

For example, if we are inside of a 4-piece with `i = 2`, then this will mean that a 3-piece with `j = 0` would have a header `(r * 3) + 1`, a 3-piece with `j = 1` would have a header `(r * 3) + 2`, and a 3-piece with `j = 3` would have a header `(r + 3) + 0`.

Similarly, after the length-and-position header `(r * 3) + f(i, j, 4)`, we encode the 3-piece term `b` as a uvarint header index.

After the term `b`, 3-pieces list zero or more 2-pieces, each of which again represets a set of `s` quads that share the same term `c` in the same position `k`. Now there are only two options for `k`: `0 <= k <= 4, k != i, k != j`, so our first header uvarint is `(s * 2) + f(f(i, j, 4), f(i, k, 4), 3)`. For example, inside a 4-piece with `i = 2` and a 3-piece with `j = 0`, a 2-piece with `k = 1` would have a header `(s * 2) + 0`, and a 2-piece with `k = 3` would have header `(s * 2) + 1`.

For 2-pieces, since there is only one position in each quad left to encode, the `s` terms in that position are just serialized in ascending order, delta-encoded.

After the zero or more 2-pieces in a 3-piece, the "end" of the 2-pieces is indicated by a serialized zero byte. Since the total number of quads `r` in the 3-piece is known, we can subtract from `r` the total number of quads found in all the 2-pieces to get the number of "remaining" quads, which are serialized in 2-tuples of uvarint header indices, delta encoded, without any delimiter or end marker ("2-tuple" just means interpretation, not any structure that actually exists as bytes).

Similarly, after the zero or more 3-pieces in a 4-piece, the "end" of the 3-pieces is indicated by a serialized zero byte. And again, since the total number of quads `s` in the 4-piece is known, we can subtract `s` from the total number of quads found in all 3-pieces to get the number of "remaining" quads, which are serialized in 3-tuples of uvarint header indices, delta encoded, without delimiter or end marker.

The body consists of zero or more 4-pieces, followed by a zero byte, followed by zero or more delta-encoded 4-tuple quads that don't fit into any piece.

## Notes on canonicalization

Piece quads are designed to play well with dataset canonicalization.
