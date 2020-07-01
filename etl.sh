#!/bin/bash
# usage: ./etl.sh [merge|table]
# Run a bunch of etl.js --op commands

years=(2018 2019)
types=(licitaciones adjudicaciones)
formats=(xls xlsx)

for type in "${types[@]}"; do
  for year in "${years[@]}"; do
    for format in "${formats[@]}"; do
      time ./etl.js --op "$1" --cores 12 \
        --directory data/"$type"/"$year" --format "$format" --type "$type"
    done
  done
done