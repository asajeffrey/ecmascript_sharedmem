# A WIP memory model

This directory contains a WIP memory model for ECMAScript shared memory and atomics.

This README contains notes summarizing the memory model.

## Goals

* Can be compiled to and from existing memory models (such as x86-TSO, ARM, LLVM or C/C++11) without adding fences to non-atomic reads and writes.
* Supports compiler optimizations such as independent read/write reordering, roach motel and dead code elimination.
* Allows inductive reasoning (e.g. no thin-air reads) and satisfies the SC-DRF theorem.
* No use of undefined behavior or undefined values.
* Requires as few changes as possible to the ECMAScript specification.
* Contains as little new work as possible.

## Preliminaries

A relation ─R→ is *total* whenever, for any *d* and *e*, either
*d* ─R→ *e*, or *e* ─R→ *d*, or *d* = *e*.

The inverse of a relation ─R→ is the relation ←R─ defined as
*d* ←R─ *e* whenever *e* ─R→ *d*.

The kernel of a relation ─R→ is the relation ←R→ defined to be
*d* ←R→ *e* whenever *d* ←R─ *e* ─R→ *d*.

## Host language requirements

The host language of interest is ECMAScript, but the model is defined for
any language which can provide appropriate executions consisting of
*events* and *data dependencies*.

In examples, we use a simple imperative language with a shared array `m`, and write:

* `r = m[i];` for a non-atomic read,
* `m[i] = e;` for a non-atomic write,
* `atomic r = m[i];` for an atomic read,
* `atomic m[i] = e;` for an atomic write, and
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
and the ‘TAR pit companion’ program (which can result in `x == m[0] == m[1] == 1`) is:
```
   m[0] = m[1];  ∥  x = m[0]; m[1] = 1;
```

The model is parameterized on an alphabet, with (possibly overlapping) subsets of *read*,
and *write* actions. In examples, the alphabet consists of:

* `R m[i] = v` (a read action)
* `W m[i] = v` (a write action)

Each memory alphabet comes with a notion of when a read *matches* a write
(in examples, when they share a memory location and a value) and when
two writes overlap (in examples, when they share a memory location).

**Definition**: a *memory alphabet* is a 6-tuple (Σ, *Rd*, *Wr*, *Mt*, *Ov*) where:
* Σ is a set of *actions*,
* *Rd* ⊆ Σ is a subset of *read actions*,
* *Wr* ⊆ Σ is a subset of *write actions*,
* *Mt* ⊆ (*Rd* × *Wr*), is the *match* relation, and
* *Ov* ⊆ (*Wr* × *Wr*), is the *overlap* relation. ∎

We are mostly treating thread executions as black boxes, but we are
interested in the sequence of labelled events that each execution
participates in, together with a notion of which events have to be
executed atomically together, and a data dependency relation on those
events.  We write *d* ─po→ *e* when event *d* precedes event *e* in
program order, *d* ←po→ *e* when *d* and *e* must be executed as one atom,
and *d* ─dd→ *e* when event *e* depends on event *d*.
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
* ─po→ is a total, transitive relation on events (po stands for *program order*),
* ─dd→ is a relation from write events to read events,
* λ : (*E* → Σ) is a *labelling*, such that
* if d ─dd→ e then d ─po→ e and not e ─po→ d.

Define:

* an *atomic event* is an event *e* where *e* ←po→ *e*,
* a *read event* is an event *e* where λ(*e*) is a read action,
* a *write event* is an event *e* where λ(*e*) is a write action,
* a write event *d* matches a read event *e* when λ(*d*) matches λ(*e*), and
* a write event *d* overlaps a write event *e* when λ(*d*) overlaps λ(*e*). ∎

Note that the host language implementation has a lot of freedom in defining data dependency.
[We will put some sanity conditions on ─dd→ to ensure SC-DRF, which will look
a lot like non-interference.]

In practice, languages will place limits on which labels can be made atomic,
for example allowing `W m[i] = v` ←po→ `W m[j] = v` only when `i == j+1` or `j == i+1`.
[We should revisit this in the ECMAScript memory alphabet.]

## Memory model

First, we observe that the program order is not observable, for example there is no
context which can distinguish `m[0] = 1; m[1] = 2;` from ` m[1] = 2; m[0] = 1;`.
Instead we are interested in a smaller relation, the *preserved program order*.

Note that most non-atomic events can be reordered, with the exception of the
last write before a release. For example, we can only swap the first two writes
in:
```
  m[0] = 1; m[0] = 2; m[0] = 3; release m[1] = 1;
```
We will call such a write event a `released write'.

**Definition**: In a thread execution, the *preserved program order* is the relation
where *d* ─ppo→ *e* whenever *d* ─po→ *e* and either:

* *d* ─dd→ *e*,
* *d* is an atomic read, and *e* is a read,
* *d* is a write, and *e* is an atomic write, or
* *d* is a write, and *e* is an overlapping released write,

where we define a write event *e* to be a *released write* whenever
there is some atomic write *c* such that *e* ─po→ *c*,
and there is no *e ─po→ d ─po→ c* where *d* overlaps *e*. ∎

Now, given a thread execution for each thread in the program,
we would like to know when they can be combined to form a program
execution. A *candidate execution* is one where we combine together
the individual thread executions. For example a candidate execution of the TAR pit is:

>  (`R m[1] → 1`) ─ppo→ (`W m[0] → 1`)  
>  (`R m[0] → 1`) ─ppo→ (`W m[1] → 1`)  

and a candidate execution of the TAR pit companion is:

>  (`R m[1] → 1`) ─ppo→ (`W m[0] → 1`)  
>  (`R m[0] → 1`)  
>  (`W m[1] → 1`)  

**Definition** Given *n* thread executions define a *candidate program execution* to be
(─rf→, ─sc→) where:

* ─rf→ is a relation between write events and matching reads,
* ─sc→ is a total transitive relation on atomic events with kernel ←po→,

such that if *c* ─rf→ *e* then:

* we do not have *e* ─hb→ *c*,
* we do not have *e* ─po→ *c*,
* there is no *c* ─hb→ *d* ─hb→ *e* where *d* overlaps *e*, and
* there is no *c* ─po→ *d* ─po→ *e* where *d* overlaps *e*,

where we define:

* *E* is *E*₁ ∪ ⋯ ∪ *Eₙ* (wlog we assume the *Eᵢ* are disjoint),
* ─dd→ is ─dd→₁ ∪ ⋯ ∪ ─dd→ₙ,
* ─po→ is ─po→₁ ∪ ⋯ ∪ ─po→ₙ,
* ─ppo→ is ─ppo→₁ ∪ ⋯ ∪ ─ppo→ₙ,
* the *happens before* relation ─hb→ is (─ppo→ ∪ ─sc→)*. ∎

Not all candidate program executions are valid, however, since there may be cycles in (─hb→ ∪ ─rf→).
For example in the TAR pit candidate execution, we have:

>  (`W m[1] → 1`) ─rf→ (`R m[1] → 1`) ─hb→ (`W m[0] → 1`) ─rf→ (`R m[0] → 1`) ─hb→ (`W m[1] → 1`)

but in the TAR pit companion, the cycle is broken:

>  (`W m[1] → 1`) ─rf→ (`R m[1] → 1`) ─hb→ (`W m[0] → 1`) ─rf→ (`R m[0] → 1`)

**Definition** A *program execution* is a candidate program execution where
  (─hb⟶ ∪ ─rf→)* is a partial order. ∎

## Compilation to and from C/C++ atomics

The mapping from ECMAScript accesses to C/C++ accesses is:

* ECMAScript non-atomic to C/C++ relaxed
* ECMAScript atomic to C/C++ sequentially consistent

The mapping from C/C++ accesses to ECMAScript accesses is:

* C/C++ non-atomic to ECMAScript non-atomic
* C/C++ relaxed to ECMAScript atomic
* C/C++ acquire/consume/release to ECMAScript atomic
* C/C++ sequentially consistent to ECMAScript atomic

**Note**: C/C++ relaxed is mapped to ECMAScript atomic because relaxed
accesses are required to be per-location sequentially consistent, and
ECMAScript non-atomics are not.

A common execution path is for a C program to be compiled to asm.js,
then executed in a run-time environment implemented in C. In this
case, a non-atomic access in the original program will be executed as
relaxed, but any other access in the original program will be executed
as sequentially consistent.

In the (hopefully unlikely) case that a program is
compiled from C to ECMAScript to C to ECMAScript to C, every memory
access in the original program will become sequentially consistent.

## TODO

Still to do:

* Define the ECMAScript alphabet.
* Define the restrictions on ←po→ for ECMAScript.
* Give semantics for the shared arrays API in terms of events.
* Give semantics for other inter-thread communication mechanisms such as message channels.
* Give examples of non-aligned access, and varying word sizes.
* Formalize the non-interference property for dd, and show SC-DRF.