// Copyright (C) 2015 Mozilla Corporation.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

// BEGIN PROLOGUE - also see epilogue
//
// Until this is incorporated into tc39/tc262:
//   - Remember to include harness.js before this file.
beginTest("futex-on-nonshared-int-arrays");
// END PROLOGUE

/*---
es7id: TBD
description: >
  Test futex operations on non-shared integer TypedArrays
---*/

var ab = new ArrayBuffer(16);

var int_views = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array];

for ( var View of int_views ) {
    var view = new View(ab);

    assert.throws(TypeError, (() => Atomics.futexWait(view, 0, 0)));
    assert.throws(TypeError, (() => Atomics.futexWake(view, 0)));
    assert.throws(TypeError, (() => Atomics.futexWakeOrRequeue(view, 0, 0, 1, 0)));
}

// BEGIN EPILOGUE
finishTest("futex-on-nonshared-int-arrays");
// END EPILOGUE