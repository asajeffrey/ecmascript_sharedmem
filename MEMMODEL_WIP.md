# A WIP memory model for ECMAScript shared memory

## Introduction

The SharedArrayBuffer proposal for ECMAScript allows byte arrays to be
shared amongst workers. This is particularly significant for asm.js
programs, since it allows multi-threaded C programs to be compiled via
LLVM to asm.js, and for C threads communicating via shared memory to
be compiled to workers communicating via a SharedArrayBuffer.

The proposed ECMAScript API for shared memory supports two kinds of
accesses: *atomic* and *non-atomic*. Atomic accesses are required to
be sequentially consistent, and are implemented using synchronizing
mechanisms such as fences or locks. Non-atomic accesses have much
weaker consistency requirements, and are implemented without any
synchronization.

In this note, we propose a WIP memory model suitable for ECMAScript.
It is designed to be as close as possible to the C/C++11 and LLVM
memory models, to support both compilation from LLVM to asm.js, and to
support implementing SharedArrayBuffer in languages such as C/C++ or
Rust. The model can be simpler than the C/C++11 or LLVM models, since
it has fewer types of access, and in particular does not have undefined
behaviours or values.

The model is similar to the C/C++11 or LLVM model, in that it is based
on read and write events, equipped with two relations:

* the *happens before* relation, where *d* happens before *e*
  whenever compiler or hardware reorderings of loads and stores
  are required to keep *d* before *e*.

* the *reads from* relation, where *d* reads from *e*
  whenever *d* is a read event, and *e* is its justifying write event.

Most of the memory model is inherited from LLVM or C/C++11.  The main
difference is how tearing is treated. We could ban all tearing, but
this is too strong, as it disallows any implementation where the
synchronization mechanism for values larger than a machine word is
different from that smaller ones.  For example, on a 32-bit
architecture, atomic 64-bit accesses might be implemented using a
global lock, whereas 32-bit accesses might be implemented using
appropriate machine instructions. For this reason, rather than
disallow tearing on all atoms, we disallow tearing on events with the
same address range.

The proposed memory model has two requirements of program executions:

* *per-address-range sequential consistency*: atomic read and write events
  which access the same address ranges are sequentially consistant, and

* *thin-air-read-free*: there are no cycles in the
  combined data- and control-flow of the program,
  so no values come out of thin air.

These requirements are very similar to those of LLVM and
C/C++11, the novelty is that we are only requiring per-address-range
sequential consistency, so atomic accesses with different address
ranges are weaker than for full sequential consistency.

We wish to avoid having to make changes to the language specification
except where inter-thead communication is involved. For this reason,
we make few requirements about the host language: for each thread
we ask for its collection of events, with *program order* and
*data dependency* relations on events.

## Preliminaries

The *inverse* of a relation ─R→ is the relation ←R─ defined as
*d* ←R─ *e* whenever *e* ─R→ *d*.

The *kernel* of a relation ─R→ is the relation ←R→ defined to be
*d* ←R→ *e* whenever *d* ←R─ *e* ─R→ *d*.

A relation ─R→ is *reflexive* whenever for any *e* we have *e* ─R→ *e*.

A relation ─R→ is *symmetric* whenever *d* ─R→ *e* implies *d* ←R─ *e*.

A relation ─R→ is *transitive* whenever *c* ─R→ *d* ─R→ *e* implies *c* ─R→ *e*.

A relation ─R→ is *antisymmetric* whenever *d* ←R→ *e* implies *d* = *e*.

A relation ─R→ is *total* whenever for any *d* and *e*, either
*d* ─R→ *e* or *e* ─R→ *d*.

A *pre-order* is a reflexive, transitive relation.

A *partial order* is an antisymmetric pre-order.

A *total order* is a total partial order.

A *partial equivalence* is a symmetric, transitive relation.

An *equivalence* is a total partial equivalence.

## Host language requirements

The host language of interest is ECMAScript, but the model is defined for
any language which can provide appropriate executions consisting of
*events* and *data dependencies*.

In examples, we use a simple imperative language with a shared array `m`, and write:

* `m[i..j]` for a non-atomic read,
* `m[i..j] = e` for a non-atomic write,
* `atomic m[i..j]` for an atomic read,
* `atomic m[i..j] = e` for an atomic write,
* `atomic op(m[i..j]) for an atomic update such as increment or CAS and
* `T₁ ∥ ⋯ ∥ Tₙ` for the parallel composition of `n` threads `T₁` to `Tₘ`.

The memory model is defined using a alphabet of *actions*, which are
individual byte reads and writes.

**Definition**: The *alphabet* Σ is the set consisting of:

* *non-atomic read-only actions*: `R m[i..j] = v`,
* *non-atomic write-only actions*: `W m[i..j] = w`,
* *atomic read-only actions*: `atomic R m[i..j] = v`,
* *atomic write-only actions*: `atomic W m[i..j] = w`, and
* *atomic read-modify-write actions*: `atomic RMW m[i..j] = v/w`,

where `m[i..j]` is an address range in a shared memory, and `v` and
`w` are (`j+1-i`)-byte values.  We call `m[i..j]` the *address range* of an
action, `v` the *read value* of an action, and `w` the *write value*
of an action. If an action has address range `m[i..j]` and read value `v` whose
`n`th byte is `b`, we say that the action *reads* `b` from `m[i+n]`,
and similarly for writes. ∎

We are mostly treating thread executions as black boxes, but we are
interested in the sequence of labelled events that each execution
participates in,
and a data dependency relation on those
events.  We write *d* ─po→ *e* when event *d* precedes event *e* in
program order, 
and *d* ─dd→ *e* when event *e* depends on event *d*.
In examples, we will often use the event labels to stand in for the events,
with subscripts if necessary to disambiguate.

For example, an execution of `m[0..1] = m[0..1] + 1;`
(where all accesses are non-atomic) is:

> `R 1 = m[0..1]` ─po→ `W m[0..1] = 2`
>
> `R 1 = m[0..1]` ─dd→ `W m[2..3] = 2`

and an execution of `atomic incr(m[0..1]);`
(the same thread, but as an atomic operation) is:

> `atomic RMW m[0..1] = 1/2`

**Definition**: a *thread execution* is a 4-tuple (*E*, λ, ─po→, ─dd→) where:

* *E* a set of *events*,
* λ : (*E* → Σ) is a *labelling*,
* ─po→ ⊆ (*E* × *E*) is the *program order* total order,
* ─dd→ ⊆ ─po→ is the *data dependency* relation,

Define:

* *e* is a *read event* whenever λ(*e*) is a read action,
* *e* is a *write event* whenever λ(*e*) is a write action,
* *e* is an *atomic event* whenever λ(*e*) is an atomic action,
* *e* reads `b` from `m[i]` whenever λ(*e*) reads `b` from `m[i]`,
* *e* writes `b` to `m[i]` whenever λ(*e*) writes `b` to `m[i]`,
* *e* has address range `m[i..j]` whenever λ(*e*) has address range `m[i..j]`. ∎

Note that the host language implementation has a lot of freedom in defining data dependency.
[We will put some sanity conditions on ─dd→ to ensure SC-DRF, which will look
a lot like non-interference.]

## Memory model

Given a thread execution for each thread in the program,
we would like to know when they can be combined to form a program
execution. A *candidate execution* is one where we combine together
the individual thread executions.

**Definition** Given *n* thread executions define a *candidate program execution* to be
(*E*, ─hb→, ─rf→) where:

* ─hb→ = (─po→ ∪ ─sw→)* is the *happens before* partial order, and
* ─rf→ ⊆ (*E* × *E*) is the *reads from* relation,

where we define:

* *E* = (*E*₁ ∪ ⋯ ∪ *Eₙ*) (wlog we assume the *Eᵢ* are disjoint),
* ─dd→ = (─dd→₁ ∪ ⋯ ∪ ─dd→ₙ),
* ─po→ = (─po→₁ ∪ ⋯ ∪ ─po→ₙ), and
* *d* ─sw→ *e* whenever *d* ─rf→ *e*, and *d* and *e* are atomics with the same address range,

such that for any event *e* which reads byte `b` from `m[i]`,
there is an event *c* ─rf→ *e* which writes byte `b` to `m[i]` such that:

* we do not have *e* ─hb→ *c*, and
* there is no event *d* which writes to `m[i]` such that *c* ─hb→ *d* ─hb→ *e*. ∎

Some candidate program executions are invalid, however, for three possible reasons:
tearing, sequential inconsistency, or thin-air read.

We could ban all tearing between all atomic events, by requiring that
if *c* ─rf→ *e* and *d* ─rf→ *e* then *c* = *d*.
This requirement makes sense in typed
languages, but it is too strong a requirement in the presence of
operations acting on the same address at different data sizes.

For example, consider the program:
```
    atomic m[0..3] = 0x00000000; atomic m[0..3] = 0xFFFFFFFF;
  ∥ x = atomic m[2..3];
```

All executions include:

> `atomic W m[0..3] = 0x00000000` ─hb→ `atomic W m[0..3] = 0xFFFFFFFF`  
> `atomic R m[2..3] = v`  

and there are executions which do not exhibit tearing, for example reading all zeros:

> `W m[0..3] = 0x00000000` ─rf→ `R m[2..3] = 0x0000`  

or reading no zeros:

> `W m[0..3] = 0xFFFFFFFF` ─rf→ `R m[2..3] = 0xFFFF`  

These executions do not exhibit tearing, since
every read event is reading from just one write event.
An execution which includes tearing is:

> `W m[0..3] = 0x00000000` ─rf→ `R m[2..3] = 0x00FF`  
> `W m[0..3] = 0xFFFFFFFF` ─rf→ `R m[2..3] = 0x00FF`  

This execution would be disallowed by memory models in which all
atomic accesses use the same synchronization mechanism, in particular
where all atomic accesses use hardware atomic instructions. However,
implementations may use different sychronization for different data
sizes, for example using mutexes for accesses larger than one machine
word.

**Definition** A candidate program execution is *per-address range isolated* whenever
if *c* ─sw→ *e* and *d* ─sw→ *e* then *c* = *d*. ∎

A similar problem affects sequential consistency. Consider the
*Independent Read Independent Write* (*IRIW*) example
```
    atomic m[0] = 0x00; atomic m[0] = 0xFF;
  ∥ atomic m[1] = 0x00; atomic m[1] = 0xFF;
  ∥ atomic x0 = m[0]; atomic x1 = m[1]; // x0 == 0xFF, x1 == 0x00
  ∥ atomic y1 = m[1]; atomic y0 = m[0]; // y0 == 0x00, y1 == 0xFF
```
This program is a classic example of the strength of sequential
consistency: in a sequentially consistent execution, all threads must
agree whether `m[0] = 0xFF` or `m[1] = 0xFF` happened first. However,
if we change the example to use a single atomic read:
```
    atomic m[0] = 0x00; atomic m[0] = 0xFF;
  ∥ atomic m[1] = 0x00; atomic m[1] = 0xFF;
  ∥ atomic x = m[0..1]; // x == 0xFF00
  ∥ atomic y = m[0..1]; // y == 0x00FF
```
the execution becomes possible, since the two-byte reads may be using a different
synchronization mechanism than the one-byte writes.

This is modeled by asking for a total order ─sc→ on atomic events, such that
an atomic read is guaranteed to read the most recent matching atomic write,
if there is one. For example, the IRIW program above has:

> `atomic W m[0] = 0x00` ─hb→ `atomic W m[0] = 0xFF`  
> `atomic W m[1] = 0x00` ─hb→ `atomic W m[1] = 0xFF`  
> `atomic R m[0] = 0xFF` ─hb→ `atomic R m[1] = 0x00`  
> `atomic R m[1] = 0xFF` ─hb→ `atomic R m[0] = 0x00`  
>
> `atomic W m[0] = 0x00` ─sw→ `atomic R m[0] = 0x00`  
> `atomic W m[0] = 0xFF` ─sw→ `atomic R m[0] = 0xFF`  
> `atomic W m[1] = 0x00` ─sw→ `atomic R m[1] = 0x00`  
> `atomic W m[1] = 0xFF` ─sw→ `atomic R m[1] = 0xFF`  

but there is no way to provide an appropriate total order for this execution.
In contrast, the mixed-size IRIW program has:

> `atomic W m[0] = 0x00` ─hb→ `atomic W m[0] = 0xFF`  
> `atomic W m[1] = 0x00` ─hb→ `atomic W m[1] = 0xFF`  
> `atomic R m[0..1] = 0xFF00`  
> `atomic R m[0..1] = 0x00FF`  
>
> `atomic W m[0..1] = 0x00FF` ─rf→ `atomic R m[0] = 0x00`  
> `atomic W m[0..1] = 0xFF00` ─rf→ `atomic R m[0] = 0xFF`  
> `atomic W m[0..1] = 0x00FF` ─rf→ `atomic R m[1] = 0x00`  
> `atomic W m[0..1] = 0xFF00` ─rf→ `atomic R m[1] = 0xFF`  

Since the execution has ─rf→ rather than ─sw→ edges, any total order
compatible with ─hb→ will suffice.

**Definition** A candidate program execution is *per-address-range sequentially consistent* if
there is a total order on atomic events ─sc→ such that:

* if *d* and *e* are atomic events and *d* ─hb→ *e* then *d* ─sc→ *e*,
* if *c* ─sw→ *e* then there is no (*c* ─sc→ *d* ─sc→ *e*) where *d* is a write event with the same address range as *e*. ∎

**Conjecture** If a candidate program execution is per-address-range sequentially consistent,
then it is per-address-range isolated. ∎

Finally, consider the classic TAR pit program `m[0] = m[1]; ∥ m[1] = m[0];`,
which has the candidate execution:

>  `W m[1] = 1` ─rf→ `R m[1] = 1` ─dd→ `W m[0] = 1` ─rf→ `R m[0] = 1` ─dd→ `W m[1] = 1`

This execution is considered invalid because the value `1` has come
from thin air. Allowing such executions breaks invariant reasoning,
for example type safety.

However, in the companion program `m[0] = m[1]; ∥ m[1] = 1;`,
we do want to allow a similar execution:

>  `W m[1] = 1` ─rf→ `R m[1] = 1` ─dd→ `W m[0] = 1` ─rf→ `R m[0] = 1`

The difference between these two executions is that in the TAR pit, we have
a cycle between ─rf→ and ─dd→, but the matching execution in the companion
does not have `R m[0] = 1` ─dd→ `W m[1] = 1`, breaking the cycle.

**Definition** A candidate program execution is *thin-air-read-free* if
(─dd→ ∪ ─rf→)* is a partial order.

**Definition** A *program execution* is a candidate program execution which is
per-address-range sequentially consistent and thin-air-read-free.

## Compilation to and from LLVM or C/C++ atomics

The mapping from ECMAScript accesses to C/C++ accesses is:

* ECMAScript non-atomic to C/C++ relaxed
* ECMAScript atomic to C/C++ sequentially consistent

The mapping from C/C++ accesses to ECMAScript accesses is:

* C/C++ non-atomic to ECMAScript non-atomic
* C/C++ relaxed to ECMAScript atomic
* C/C++ acquire/consume/release to ECMAScript atomic
* C/C++ sequentially consistent to ECMAScript atomic

The mapping from ECMAScript accesses to LLVM accesses is:

* ECMAScript non-atomic to LLVM unordered
* ECMAScript atomic to LLVM sequentially consistent

The mapping from LLVM accesses to ECMAScript accesses is:

* LLVM non-atomic to ECMAScript non-atomic
* LLVM unordered to ECMAScript non-atomic
* LLVM monotonic to ECMAScript atomic
* LLVM acquire/consume/release to ECMAScript atomic
* LLVM sequentially consistent to ECMAScript atomic

**Note**: C/C++ relaxed and LLVM monotonic are mapped to ECMAScript atomic because relaxed
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

## SC-DRF

So far, there have been no constraints on the ─dd→ relation,
implementors are free to choose any relation, including the empty
one. We now show how, assuming some constraints on ─dd→, we can
establish the *SC-DRF* theorem, which allows programmers to reason
about appropriately sychronized programs as if they were sequentially
consistent.

**Definition** A program execution is *sequentially consistent* if
there is a total order ─sc→ ⊇ ─hb→ where,
for any event *e* which reads byte `b` from `m[i]`,
there is an event *c* ─rf→ *e* which writes byte `b` to `m[i]` such that:

* we do not have *c* ─sc→ *e*, and
* there is no event *d* which writes to `m[i]` such that *c* ─sc→ *d* ─sc→ *e*. ∎

**Definition** Events *d* and *e* are *concurrent* if we do not have *d* ─hb→ *e*
or *e* ─hb→ *d*. ∎

**Definition** A program execution has a *write-write conflict* if
there are concurrent *d* and *e* which both write to `m[i]`. ∎

**Definition** A program execution has a *read-write conflict* if
there is are concurrent *d* which writes to `m[i]` and *e* which reads
from `m[i]`. ∎

**Definition** A program execution is *data-race-free* if
it has no write-write or read-write conflicts. ∎

**Definition** A program is *dd-sound* whenever,
for any thread execution (*c̅* ─po→ *d* ─po→ *e̅*)
where *d* reads `v` from `m[i..j]` and there is no *e* ∈ *e̅*  where *d* ─dd→ e,
and for any `v′`,
there is a thread execution (*c̅* ─po→ *d′* ─po→ *e̅*)
where *d′* reads `v′` from `m[i..j]`. ∎

**Conjecture (SC-DRF)** In a dd-sound program where every sequentially consistent execution
is data-race-free, every execution is sequentially consistent. ∎

## TODO

Still to do:

* Give semantics for the shared arrays API in terms of events.
* Give semantics for other inter-thread communication mechanisms such as message channels.
* Formalize the non-interference property for dd, and show SC-DRF.
