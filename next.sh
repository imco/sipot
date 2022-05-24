# Este script se utiliza entre sesiones de scraping.
# Se le pasa un direction con los XLS descargados para que
# compare la lista de sujetos obligados contra las descargas
# encontradas, y así determinar que organizaciones se deben
# buscar en la siguiente sesión.
# uso: sh next.sh <directorio_con_descargas> <path/to/archivo_con_lista_de_obligados>
# ejemplo: sh next.sh data/estados/nuevo_leon/adjudicaciones instituciones_obligadas/nuevo_leon.txt

DIR=$1

OBLIGADOS=$2

echo "Analizando $DIR"

# Revisa documentos en el directorio y crea índice de descargas
./etl.js --directory $DIR > descargas.csv

# Encuentra la lista de organizaciones con descargas
cut -d ';' -f1 descargas.csv | tail -n +2 | sort > file.downloaded
echo "\n----------------"
echo "Organizaciones con archivos: $(wc -l < file.downloaded)"
echo "----------------"
echo "$(cut -f1 file.downloaded)"

# Remueve dobles comillas para hacer mejores comparaciones
sed 's/^"//' file.downloaded | sed 's/"$//' | sed 's/\\"/"/g' > file.downloaded2

# Enlista organizaciones que no tienen descargas aún
comm -23 $OBLIGADOS file.downloaded2 > file.only
echo "\n----------------"
echo "Organizaciones sin descargas aún para: $(wc -l < file.only)"
echo "----------------"
echo "$(cut -f1 file.only)"

# Encuentra organizaciones que no mostraron contratos
grep -B4 -R "No hay" $DIR/*log | grep Objetivo | cut -d ' ' -f 2- > no-obligados.txt
grep -B4 -R "No hay" $DIR/*log | \
  grep Trabajando | cut -d '-' -f 2- | cut -d ' ' -f 5- >> no-obligados.txt
sort no-obligados.txt | uniq > no-obligados.sorted
mv no-obligados.sorted no-obligados.txt
echo "\n----------------"
echo "De los logs, organizaciones sin contratos: $(wc -l < no-obligados.txt)" 
echo "----------------"
echo "$(cut -f1 no-obligados.txt)"

# Enlista organizaciones que no tuvieron resultados de búsqueda
grep -B4 -R "Se encontraron 0 resultados en la consulta" $DIR/*log | grep Objetivo | cut -d ' ' -f 2- > file.noresults
grep -B5 -R "Se encontraron 0 resultados en la consulta" $DIR/*log | \
  grep Trabajando | cut -d '-' -f 2- | cut -d ' ' -f 5- >> file.noresults
sort file.noresults | uniq > file.noresults.sorted
mv file.noresults.sorted file.noresults
echo "\n----------------"
echo "De los logs, organizaciones con 0 resultados: $(wc -l < file.noresults)" 
echo "----------------"
echo "$(cut -f1 file.noresults)"

# Filtra las que [aparentemente] no tienen obligaciones
comm -23 file.only no-obligados.txt > file.obliged
# Filtra las que no tuvieron resultados
comm -23 file.obliged file.noresults > file.toget

# Algunas organizaciones se tienen que pedir por correo
grep -B7 -R "Execution context was destroyed" $DIR/*log | grep Objetivo | cut -d ' ' -f 2- > file.email
grep -B7 -R "descarga excede" $DIR/*log | grep Objetivo | cut -d ' ' -f 2- >> file.email
grep -B9 -R "descarga excede" $DIR/*log | \
  grep Trabajando | cut -d '-' -f 2- | cut -d ' ' -f 5- >> file.email
sort file.email | uniq > file.email.sorted
mv file.email.sorted file.email
echo "\n----------------"
echo "De los logs, organizaciones que requieren email: $(wc -l < file.email)"
echo "----------------"
sort file.email | uniq | tee file.email

# Finalmente, enumera las que siguen por trabajar
cp file.toget pendientes.txt
echo "\n----------------"
echo "Organizaciones a scrapear de nuevo: $(wc -l < pendientes.txt)"
echo "----------------"
echo "$(cut -f1 pendientes.txt)"

# Elimina archivos temporales, deja descargas, no obligados, y pendientes
rm file.* no-obligados.txt
