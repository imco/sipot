# Este script se utiliza entre sesiones de scraping.
# Se le pasa un direction con los XLS descargados para que
# compare la lista de sujetos obligados contra las descargas
# encontradas, y así determinar que organizaciones se deben
# buscar en la siguiente sesión.
# uso: sh next2.sh <directorio_con_descargas>

DIR=$1

echo "Analizando $DIR"

# Revisa documentos en el directorio y crea índice de descargas
./etl.js --directory $DIR > descargas.csv

# Encuentra la lista de organizaciones con descargas
cut -d ';' -f1 descargas.csv | tail -n +2 | sort > file.downloaded
echo "Organizaciones con archivos: $(wc -l file.downloaded | cut -d' ' -f1)"

# Enlista organizaciones que no tienen descargas aún
comm obligados.txt file.downloaded -23 > file.only
echo "Organizaciones sin descargas aún para: $(wc -l file.only | cut -d' ' -f1)"

# Remueve dobles comillas para hacer mejores comparaciones
sed 's/^"//' file.only | sed 's/"$//' | sed 's/\\"/"/g' > file.next

# Encuentra organizaciones que no mostraron contratos
grep -B4 -R "No hay" $DIR/*log | grep Objetivo | cut -d ' ' -f 2- > no-obligados.txt
grep -B4 -R "No hay" $DIR/*log | \
  grep Trabajando | cut -d '-' -f 2- | cut -d ' ' -f 5- >> no-obligados.txt
sort no-obligados.txt | uniq > no-obligados.sorted
mv no-obligados.sorted no-obligados.txt
echo "De los logs, organizaciones sin contratos: $(wc -l no-obligados.txt | cut -d' ' -f1)"

# Enlista organizaciones que no tuvieron resultados de búsqueda
grep -B4 -R "Se encontraron 0 resultados en la consulta" $DIR/*log | grep Objetivo | cut -d ' ' -f 2- > file.noresults
grep -B5 -R "Se encontraron 0 resultados en la consulta" $DIR/*log | \
  grep Trabajando | cut -d '-' -f 2- | cut -d ' ' -f 5- >> file.noresults
sort file.noresults | uniq > file.noresults.sorted
mv file.noresults.sorted file.noresults
echo "De los logs, organizaciones con 0 resultados: $(wc -l file.noresults | cut -d' ' -f1)"

# Filtra las que [aparentemente] no tienen obligaciones
comm file.next no-obligados.txt -23 > file.obliged
# Filtra las que no tuvieron resultados
comm file.obliged file.noresults -23 > file.toget

# Algunas organizaciones se tienen que pedir por correo
grep -B7 -R "Execution context was destroyed" $DIR/*log | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > file.email
grep -B7 -R "descarga excede" $DIR/*log | grep Objetivo | cut -d ' ' -f 2- | sort | uniq >> file.email
echo "De los logs, organizaciones que requieren email: $(wc -l file.email | cut -d' ' -f1)"
echo "----------------"
sort file.email | uniq | tee file.email

# Finalmente, enumera las que siguen por trabajar
cp file.toget pendientes.txt
echo "Organizaciones a scrapear de nuevo: $(wc -l pendientes.txt | cut -d' ' -f1)"

# Elimina archivos temporales, deja descargas, no obligados, y pendientes
rm file.* no-obligados.txt
