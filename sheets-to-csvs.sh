#!/bin/bash
# usage: ./sheets-to-csv.sh [input]

# 1. Gets sheet names
# 2. Filter out Informacion (first one) and matching "hidden"
# 3. For each sheet append CSV output to a file named after the worksheet
# 4. Skipping the first 3 header lines via in2csv
# 5. The added a,b,c... header is removed with awk
# 6. Outputs to stdout

sheetnames=$(in2csv --names "$1")
for name in $sheetnames; do
  # Skip Información and Informacion, Hidden_ and hidden_
  if [[ $name != *"Informa"* ]] && [[ $name != *"idden"* ]]; then
    in2csv --no-header-row -K 3 --sheet "$name" "$1" | \
      awk 'NR>1' >> $name.csv
  fi
done