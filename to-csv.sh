#!/bin/bash
# usage: ./to-csv.sh [input] [cols-to-skip]

# 1. Skips the first lines down to the start of the data table
# 2. Removes some columns
# 3. Line breaks found within cells are transformed to spaces
# 4. Outputs to stdout

in2csv --skip-lines 6 --no-header-row $1 | \
  csvcut --not-columns $2 | \
  csvformat -U 1 -M '@' | \
  tr '\n@' ' \n'