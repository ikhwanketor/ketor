# Ketor tests

    node tests/run-all.js          # every suite
    node tests/run-all.js insert   # suites whose name contains "insert"

No dependency, no config, no network. A suite builds the rom it needs, so the
suites run anywhere and give the same answer every time.

## What is here

    helpers/workbench.js       loads the app scripts into a fake window and runs the
                               code the app handed to its workers, which is what makes
                               a build happen outside a browser
    helpers/synthetic-rom.js   builds a rom with the shape the engine has to handle:
                               a four byte little endian table based at 0x08000000,
                               records that start with 01 00 and close with 05 09 0A,
                               zero padding after every record, and a large area that
                               nothing points at, where a moved record may live
    helpers/tiny-test.js       the runner: one line per case, non zero exit on failure
    insert-policy.test.js      what happens to a record that outgrows its room
    pointer-detector.test.js   what the pointer detector finds when the answer is known

## Why a built rom and not the real project

The real roms and projects used while developing this are the user's files; they are
not in the repository and a test must not depend on them. The synthetic rom copies the
shape that was worked out from Castlevania - Aria of Sorrow (its table, its record
format and its padding), so a gate here exercises the same code path as the real
project does, and the numbers that came out of the real project are quoted in the test
titles.

The heavier, rom specific harnesses (a full 151417 text project, a 400 text insert, the
detector across five real roms) stay outside the repository for that reason. They are
run by hand when a change deserves them, and their results are recorded in the commit
messages and in PRD_KETOR_BATCH16-20.md.
