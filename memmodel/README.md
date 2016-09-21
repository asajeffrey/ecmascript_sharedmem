# A WIP memory model

This directory contains a WIP memory model for ECMAScript shared memory and atomics.

This README contains notes summarizing the memory model.

## Goals

* Can be compiled to and from LLVM without adding fences to relaxed reads and writes.
* Support compiler optimizations such as independent read/write reordering, roach motel and dead code elimination.
* Allows inductive reasoning (e.g. no thin-air reads) and satisfies the SC-DRF theorem.
* No use of undefined behavior or undefined values.
* Requires as few changes as possible to the ECMAScript specification.
* Contains as little new work as possible.

## Host language requirements

The host language of interest is ECMAScript, but we treat host
language executions as black boxes.

In examples, we assume a shared array `m`, and write:

* `r = m[i];` for a relaxed read,
* `m[i] = e;` for a relaxed write,
* `acquire r = m[i];` for an acquiring read,
* `release m[i] = e;` for a releasing write, and
* `atomic m[i] = op(r = m[i]);` for an atomic update such as increment or CAS.
* `T₁ ∥ ⋯ ∥ Tₙ` for the parallel composition of `n` threads `T₁` to `Tₘ`.

For example, the ‘variable access reordering′ example (which could result in `r0 == 0` and `r1 == 1`) is:
```
  m[0] = 1; m[1] = 2;  ∥  r1 = m[1]; r0 = m[0];
```
the ‘TAR pit’ program (which should not result in `x == m[0] == m[1] == 1`) is:
```
   m[0] = m[1];  ∥  x = m[0]; m[1] = x;
```
and the ‘TAR pit companion’ program (which could result in `x == m[0] == m[1] == 1`) is:
```
   m[0] = m[1];  ∥  x = m[0]; m[1] = 1;
```

The model is parameterized on an alphabet, with (possibly overlapping) subsets of *read*,
*write*, and *atomic* actions. In examples, the alphabet consists of:

* `R m[i] → v` (a read action)
* `W m[i] ← v` (a write action)
* `R m[i] ⇒ v` (an atomic read action)
* `W m[i] ⇐ v` (an atomic write action)
* `RW m[i] ⇐ v ⇒ w (an atomic read write action)

**Definition**: a *memory alphabet* is a 4-tuple (Σ, *R*, *W*, *A*) where:
* Σ is a set of *actions*,
* *R* ⊆ Σ is a subset of *read actions*,
* *W* ⊆ Σ is a subset of *write actions*, and
* *A* ⊆ Σ is a subset of *atomic actions*. ∎

We are mostly treating thread executions as black boxes, but we are
interested in the sequence of labelled events that each execution
participates in, together with a data dependency relation on those
events.  We write *d* ─po→ *e* when event *d* precedes event *d* in
program order, and *d* ─dd→ *e* when event *e* depends on event *d*.
In examples, we will often use the event labels to stand in for the events
(with subscripts if necessary to disambiguate).

For example, an execution of `x = m[0]; m[1] = x;` has:

* program order: (`R m[0] → 1`) ─po→ (`W m[1] → 1`) 
* data dependency: (`R m[0] → 1`) ─dd→ (`W m[1] → 1`) 

and an execution of `x = m[0]; m[1] = 1;` has:

* program order: (`R m[0] → 1`) ─po→ (`W m[1] → 1`) 
* no data dependencies

**Definition**: a *thread execution* is a 4-tuple (*E*, ─po→, ─dd→, λ) where:
* *E* a set of *events*,
* ─po→ ⊆ (E × E) is a total *program order*,
* ─dd→ ⊆ (E × E) is a *data dependency* relation, and
* λ : (E → Σ) is a *labelling*.
We lift up read, write and atomic events from the label:
* a *read event* is an event *e* where λ(*e*) is a read action,
* a *write event* is an event *e* where λ(*e*) is a write action,
* an *atomic event* is an event *e* where λ(*e*) is an atomic action. ∎

Note that the host language has a lot of freedom in defining data dependency.
[We will put some sanity conditions on ─dd→ to ensure SC-DRF, which will look
a lot like non-interference.]
