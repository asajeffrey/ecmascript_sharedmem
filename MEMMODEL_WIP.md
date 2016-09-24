# A WIP memory model

This directory contains a WIP memory model for ECMAScript shared memory and atomics.

This README contains notes summarizing the memory model.

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

The model is based on *events* (either reads `R m[i] = v` or writes
`W m[i] = w`) where each event involves a *location* in memory `m[i]`,
and a byte *value* `v`. These events come equipped with two relations:

* the *happens before* relation, where *d* ─hb→ *e*
  whenever any context which observes *e* must also observe *d*, and
* the *reads from* relation, where *d* ─rf→ *e*
  whenever *e* is a read event, and *d* is its justifying write event.

In particular, *d* ←hb→ *e* whenever *d* and *e* events from the same atom,
and must be executed together. The ←hb→ relation is a partial equivalence,
where *e* ←hb→ *e* whenever *e* is an atomic event.

For example, consider the thread which atomically zeroes eight bytes
of memory, then atomically assigns to them (written in pseudo-Rust):
```
  m[0..7] = [0,0,0,0,0,0,0,0];
  m[0..7] = [1,2,3,4,5,6,7,8];
```
An execution of this thread is:

> `W m[0] = 0` ←hb→ ⋯ ←hb→ `W m[7] = 0`  
>   ─hb→ `W m[0] = 1` ←hb→ ⋯ ←hb→ `W m[7] = 8`

In parallel, we could run a program which reads two bytes of memory:
```
  [r₂,r₃] = m[2..3];
```

Executions of this thread are of the form:

> `R m[2] = v` ←hb→ `R m[3] = w`

Putting these two threads in parallel, one program execution has the reader reading all zeros:

> `W m[2] = 0` ─rf→ `R m[2] = 0`  
> `W m[3] = 0` ─rf→ `R m[3] = 0`  

and another execution has the reader reading no zeros:

> `W m[2] = 3` ─rf→ `R m[2] = 3`  
> `W m[3] = 4` ─rf→ `R m[3] = 4`  

These executions do not exhibit tearing, since
every read atom is reading from just one write atom.
An execution which includes tearing is:

> `W m[2] = 0` ─rf→ `R m[2] = 0`  
> `W m[3] = 4` ─rf→ `R m[3] = 4`  

There is an atomics implementation which can demonstrate this
behavior, however, which is one where the synchronization mechanism
for 64-bit values is different from that for 16-bit values.  For
example, on a 32-bit architecture, atomic 64-bit accesses might be
implemented using a global lock, whereas 16-bit accesses might be
implemented using appropriate machine instructions.

For this reason, rather than disallow tearing on all atoms,
we disallow tearing on events with the same address range.

[TODO: discuss per-byte SC, discuss non-atomics, and make sure the
intro lines up with the formalism.]

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

* `m[i]` for a non-atomic read,
* `m[i] = e` for a non-atomic write,
* `m[i..j]` for an atomic read,
* `m[i..j] = [eᵢ,⋯,eⱼ]` for an atomic write, and
* `m[i..j] = op(m[i..j])` for an atomic update such as increment or CAS.
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

**Definition**: The *alphabet* Σ is the set consisting of:

* *read actions*: `R m[i] = v`, and
* *write actions*: `W m[i] = v`,

where `m[i]` is an index in a shared memory, and `v` is a byte value
We call `m[i]` the *location* of an action, and `v` the *value* of an action. ∎

We are mostly treating thread executions as black boxes, but we are
interested in the sequence of labelled events that each execution
participates in, together with a notion of which events have to be
executed atomically together, and a data dependency relation on those
events.  We write *d* ─po→ *e* when event *d* precedes event *e* in
program order, *d* ←po→ *e* when *d* and *e* must be executed as one atom,
and *d* ─dd→ *e* when event *e* depends on event *d*.
In examples, we will often use the event labels to stand in for the events
(with subscripts if necessary to disambiguate), and write
[*e*₁,⋯,*eₙ*] when *e*₁ ←po→ ⋯ ←po→ *eₙ* are atomic.

For example, an execution of `x = m[0]; m[1] = x;` has:

> `R m[0] → 1` ─po→ `W m[1] → 1`
>
> `R m[0] → 1` ─dd→ `W m[1] → 1`

an execution of `x = m[0]; m[1] = 1;` has:

> `R m[0] → 1` ─po→ `W m[1] → 1`

an execution of `r₀ = m[0]; r₁ = m[1];` has:

> `R m[0] → 1` ─po→ `R m[1] → 2`

an execution of `[r₀] = m[0..0]; [r₁] = m[1..1];` has:

> [`R m[0] → 1`] ─po→ [`R m[1] → 2`]

an execution of `[r₀,r₁] = m[0..1];` has:

> [`R m[0] → 1`,`R m[1] → 2`]

an execution of `m[0] = 1; m[1] = 2;` has:

> `W m[0] → 1` ─po→ `W m[1] → 2`

an execution of `m[0..0] = [1]; m[1..1] = [2];` has:

> [`W m[0] → 1`] ─po→ [`W m[1] → 2`]

an execution of `m[0..1] = [1,2];` has:

> [`W m[0] → 1`,`W m[1] → 2`]

**Definition**: a *thread execution* is a 5-tuple (*E*, *A*, λ, ─po→, ─dd→) where:

* *E* a set of *events*,
* *A ⊆ E* is the set of *atomic events*,
* λ : (*E* → Σ) is a *labelling*,
* ─po→ ⊆ (*E* × *E*) is the *program order* total pre-order,
* ─dd→ ⊆ ─po→ is the *data dependency* relation,

Define:

* the set of *read events*, *R*, is { *e* | λ(*e*) is a read action },
* the set of *write events*, *W*, is { *e* | λ(*e*) is a write action },
* the *value* of an event, val(*e*), is the value of λ(*e*),
* the *location* of an event, loc(*e*) is the location of λ(*e*), and
* the *location range* of an event, range(*e*), is { loc(*d*) | *d* ←hb→ *e* }.

Note that the host language implementation has a lot of freedom in defining data dependency.
[We will put some sanity conditions on ─dd→ to ensure SC-DRF, which will look
a lot like non-interference.]

In practice, languages will place limits on location ranges,
for example allowing {`m[i]`,`m[j]`} only when `i == j+1` or `j == i+1`,
but this does not impact the memory model.

## Memory model

First, we observe that the program order is not observable, for example there is no
context which can distinguish `m[0] = 1; m[1] = 2;` from ` m[1] = 2; m[0] = 1;`.
Instead we are interested in a smaller relation, the *preserved program order*.

Note that most non-atomic events can be reordered, with the exception of
data dependencies and writes to the same location. For example the program:
```
  x = m[0]; y = m[0]; m[1] = 1; m[1] = x;
```
has executions of the form:

> `R m[0] = v` ─po→ `R m[0] = w` ─po→ `W m[1] = 1` ─po→ `W m[1] = v`
>
> `R m[0] = v` ─dd→ `W m[1] = v`  

and so we have preserved program order:

> `R m[0] = v` ─ppo→ `W m[1] = v` ←ppo─ `W m[1] = 1`  
> `R m[0] = w`

**Definition**: In a thread execution, the *preserved program order* is the relation
where *d* ─ppo→ *e* whenever *d* ─po→ *e* and either:

* *d* is a data dependency of *e*,
* *d* is an atomic read, and *e* is a read,
* *d* is a write, and *e* is an atomic write, or
* *d* and *e* are writes to the same location. ∎

Now, given a thread execution for each thread in the program,
we would like to know when they can be combined to form a program
execution. A *candidate execution* is one where we combine together
the individual thread executions. For example a candidate execution of the TAR pit is:

>  `R m[1] = 1` ─ppo→ `W m[0] = 1`  
>  `R m[0] = 1` ─ppo→ `W m[1] = 1`  

and a candidate execution of the TAR pit companion is:

>  `R m[1] = 1` ─ppo→ `W m[0] = 1`  
>  `R m[0] = 1`  
>  `W m[1] = 1`  

**Definition** Given *n* thread executions define a *candidate program execution* to be
(*E*, ─hb→, ─rf→) where:

* ─hb→ = (─ppo→ ∪ ─sw→)* is the *happens before* partial order, and
* ←rf─ : *R* → *W* is the *reads from* function,

such that if *c* ─rf→ *e* then:

* *c* has the same location and value as *e*,
* we do not have (*e* ─hb→ *c*) or (*e* ─po→ *c*),
* there is no (*c* ─hb→ *d* ─hb→ *e*) or (*c* ─po→ *d* ─po→ *e*) where *d* writes to the same location as *e*,

where we define:

* *E* = (*E*₁ ∪ ⋯ ∪ *Eₙ*) (wlog we assume the *Eᵢ* are disjoint),
* *A* = (*A*₁ ∪ ⋯ ∪ *Aₙ*),
* ─dd→ = (─dd→₁ ∪ ⋯ ∪ ─dd→ₙ),
* ─po→ = (─po→₁ ∪ ⋯ ∪ ─po→ₙ),
* ─ppo→ = (─ppo→₁ ∪ ⋯ ∪ ─ppo→ₙ), and
* ─sw→ = (─rf→ ∩ (*A* × *A*)). ∎

Not all candidate program executions are valid, however, since there may be cycles in (─hb→ ∪ ─rf→).
For example in the TAR pit candidate execution, we have:

>  `W m[1] = 1` ─rf→ `R m[1] = 1` ─hb→ `W m[0] = 1` ─rf→ `R m[0] = 1` ─hb→ `W m[1] = 1`

but in the TAR pit companion, the cycle is broken:

>  `W m[1] = 1` ─rf→ `R m[1] = 1` ─hb→ `W m[0] = 1` ─rf→ `R m[0] = 1`

**Definition** A candidate program execution is *thin-air-read-free* if
(─hb→ ∪ ─rf→)* is a partial order.

[TODO: motivate these defns.]

**Definition** A candidate program execution is *per-byte sequentially consistent* if
there is a total order ─mo→ ⊆ (*A* × *A*) such that:

* if *d* ─po→ *e* then *d* ─mo→ *e*,
* if *d* ─rf→ *e* then *d* ─mo→ *e*,
* if *d* ─rf→ *e* and *c* is an atomic write to the same location as *c* and *d*,
  then either *c* ─mo→ *d* or *e* ─mo→ *c*. ∎

**Definition** A candidate program execution is *per-range isolated*
if, whenever *b* ─sw→ *c* ←hb→ *e* ←sw─ *d* and *b*, *c*, *d* and *e*
all have the same location range, then *b* ←hb→ *d*. ∎

**Definition** A *program execution* is a candidate program execution which is
thin-air-read-free, per-byte sequentially consistent, and per-range isolated.

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

The requirement that program executions are per-byte sequentially consistent
constrains the implementation in the case that it has to use locks to
implement atoms whose data size is large than one machine word.
Inside the critical section, accesses have to be sequentially consistent,
not just relaxed.

[TODO: do we want to relax this requirement?]

## TODO

Still to do:

* Define the ECMAScript alphabet.
* Define the restrictions on ←po→ for ECMAScript.
* Give semantics for the shared arrays API in terms of events.
* Give semantics for other inter-thread communication mechanisms such as message channels.
* Give examples of non-aligned access, and varying word sizes.
* Formalize the non-interference property for dd, and show SC-DRF.
