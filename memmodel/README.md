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

## Host language requirements

The host language of interest is ECMAScript, but the model is defined for
any language which can provide appropriate executions consisting of
*events* and *data dependencies*.

In examples, we use a simple imperative language with a shared array `m`, and write:

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
and the ‘TAR pit companion’ program (which can result in `x == m[0] == m[1] == 1`) is:
```
   m[0] = m[1];  ∥  x = m[0]; m[1] = 1;
```

The model is parameterized on an alphabet, with (possibly overlapping) subsets of *read*,
*write*, and *atomic* actions. In examples, the alphabet consists of:

* `R m[i] → v` (a read action)
* `W m[i] ← v` (a write action)
* `R m[i] ⇒ v` (an atomic read action)
* `W m[i] ⇐ v` (an atomic write action)
* `RW m[i] ⇐ v ⇒ w` (an atomic read write action)

Each memory alphabet comes with a notion of when a read *matches* a write
(in examples, when they share a memory location and a value) and when
two writes overlap (in examples, when they share a memory location).

**Definition**: a *memory alphabet* is a 6-tuple (Σ, *Rd*, *Wr*, *At*, *Mt*, *Ov*) where:
* Σ is a set of *actions*,
* *Rd* ⊆ Σ is a subset of *read actions*,
* *Wr* ⊆ Σ is a subset of *write actions*,
* *At* ⊆ Σ is a subset of *atomic actions*,
* *Mt* ⊆ (*Rd* × *Wr*), is the *match* relation, and
* *Ov* ⊆ (*Wr* × *Wr*), is the *overlap* relation. ∎

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
* ─po→ ⊆ (*E* × *E*) is a total *program order*,
* ─dd→ ⊆ ─po→ is a *data dependency* relation, and
* λ : (*E* → Σ) is a *labelling*.

We lift up definitions from labels to events:

* a *read event* is an event *e* where λ(*e*) is a read action,
* a *write event* is an event *e* where λ(*e*) is a write action,
* an *atomic event* is an event *e* where λ(*e*) is an atomic action,
* a write event *d* matches a read event *e* when λ(*d*) matches λ(*e*), and
* a write event *d* overlaps a write event *e* when λ(*d*) overlaps λ(*e*). ∎

Note that the host language implementation has a lot of freedom in defining data dependency.
[We will put some sanity conditions on ─dd→ to ensure SC-DRF, which will look
a lot like non-interference.]

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
there is some non-overlapping atomic write *c* such that *e* ─po→ *c*,
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
(*E*, ─ppo→, ─rf→) where:

* *E* = *E*₁ ∪ ⋯ ∪ *E*ₙ,
* ─dd→ = ─dd→₁ ∪ ⋯ ∪ ─dd→ₙ, and
* ─po→ = ─po→₁ ∪ ⋯ ∪ ─po→ₙ, and
* ─ppo→ = ─ppo→₁ ∪ ⋯ ∪ ─ppo→ₙ, and
* ─rf→ ⊆ (*E* × *E*),

such that if *c* ─rf→ *e* then:

* *e* is a read, and *c* is a matching write,
* we do not have *e* ─hb→ *c*,
* we do not have *e* ─po→ *c*,
* there is no *c* ─hb→ *d* ─hb→ *e* where *d* overlaps *e*, and
* there is no *c* ─po→ *d* ─po→ *e* where *d* overlaps *e*, 

where we define:

* the *synchronizes with* relation ─sw→ is (─rf→ ∩ (*At* × *At*)), and
* the *happens before* relation ─hb→ is (─ppo→ ∪ ─sw→)*. ∎

Not all candidate program executions are valid, however, since there may be cycles in (─ppo→ ∪ ─rf→).
For example in the TAR pit candidate execution, we have:

>  (`W m[1] → 1`) ─rf→ (`R m[1] → 1`) ─ppo→ (`W m[0] → 1`) ─rf→ (`R m[0] → 1`) ─ppo→ (`W m[1] → 1`)

but in the TAR pit companion, the cycle is broken:

>  (`W m[1] → 1`) ─rf→ (`R m[1] → 1`) ─ppo→ (`W m[0] → 1`) ─rf→ (`R m[0] → 1`)

**Definition** A *program execution* is a candidate program execution where
  (─ppo⟶ ∪ ─rf→)* is a partial order. ∎

## TODO

Still to do:

* Define the ECMAScript alphabet.
* Give semantics for the shared arrays API in terms of events.
* Allow non-aligned access, and varying word sizes.
* Formalize the non-interference property for dd, and show SC-DRF.
