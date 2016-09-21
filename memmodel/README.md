# A WIP memory model

This directory contains a WIP memory model for ECMAScript shared memory and atomics.

## Goals

* Can be compiled to and from LLVM without adding fences to relaxed reads and writes.
* Support compiler optimizations such as independent read/write reordering, roach motel and dead code elimination.
* Allows inductive reasoning (e.g. no thin-air reads) and satisfies the SC-DRF theorem.
* No use of undefined behavior or undefined values.
* Requires as few changes as possible to the ECMAScript specification.
* Contains as little new work as possible.



