#!/bin/sh
# Runs every browser test against ../inkling.html. Build first: sh ../build.sh
cd "$(dirname "$0")"
fail=0
for t in test2 test3 test4 test5 test7 test8 test9 test10 test11 test12 test13 test14 test15 test16 test17 test18 test19 test20 test21 test22 test23 test24 test25 test26 test27 test28 test29 test30 test31 test32 test33 test34; do
  echo "== $t"
  out=$(python3 "$t.py" 2>&1); echo "$out" | tail -4
  echo "$out" | grep -q "Traceback\|ERRORS.*\['" && { echo "   ^ $t FAILED"; fail=1; }
done
[ $fail = 0 ] && echo "ALL TESTS PASSED" || echo "SOME TESTS FAILED"
exit $fail
