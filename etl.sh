#!/bin/bash
# usage: ./tablas.sh
# Run a bunch of etl.js --op table commands

years=(2018 2019)
types=(licitaciones adjudicaciones)
formats=(xls xlsx)

for type in "${types[@]}"; do
  for year in "${years[@]}"; do
    for format in "${formats[@]}"; do
      time ./etl.js --op table --cores 12 \
        --directory data/"$type"/"$year" --format "$format" --type "$type"
    done
  done
done