#!/bin/bash

# uso:
# buscar duplicados: ./dedup.sh
# eliminar duplicados: ./dedup.sh rm

declare -A arr
shopt -s globstar

OP="${1:-find}"

for file in **; do
  [[ -f "$file" ]] || continue

  read cksm _ < <(md5sum "$file")
  if [ ${arr[$cksm]+_} ]; then
    echo "archivo $file es duplicado de ${arr[$cksm]}"
    if [ $OP == 'rm' ]; then
      echo "eliminando $file"
      rm $file
    fi
  else
    arr[$cksm]=$file
  fi
done