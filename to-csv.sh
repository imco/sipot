#!/bin/bash
# usage: ./to-csv.sh [input] [cols-to-skip]

# 1. Adds default column names a,b,c,d,e
# 2. Removes some columns
# 3. Line breaks found within cells are transformed to spaces
# 4. Outputs to stdout
# 5. Skipping the first lines down to the start of the data table

in2csv --no-header-row $1 | \
  csvcut --not-columns $2 | \
  csvformat -U 1 -M '@' | \
  tr '\n@' ' \n' | \
  awk 'NR>7'