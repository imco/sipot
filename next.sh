# Build index of downloads
./etl.js --directory 2018/ > 2018.csv
./etl.js --directory 2019/ > 2019.csv
./etl.js --directory directa/2018/ > d018.csv
./etl.js --directory directa/2019/ > d019.csv

# Get list of downloaded organizations
cut -d ';' -f1 2018.csv | tail -n +2 | sort > 2018.downloaded
cut -d ';' -f1 2019.csv | tail -n +2 | sort > 2019.downloaded
cut -d ';' -f1 d018.csv | tail -n +2 | sort > d018.downloaded
cut -d ';' -f1 d019.csv | tail -n +2 | sort > d019.downloaded

echo "Organizaciones con archivos para 2018: $(wc -l 2018.downloaded | cut -d' ' -f1)"
echo "Organizaciones con archivos para 2019: $(wc -l 2019.downloaded | cut -d' ' -f1)"
echo "Organizaciones con archivos para adjudicación directa 2018: $(wc -l d018.downloaded | cut -d' ' -f1)"
echo "Organizaciones con archivos para adjudicación directa 2019: $(wc -l d019.downloaded | cut -d' ' -f1)"

# Find organizations with no downloads
comm obligados.txt 2018.downloaded -23 > 2018.only
comm obligados.txt 2019.downloaded -23 > 2019.only
comm obligados.txt d018.downloaded -23 > d018.only
comm obligados.txt d019.downloaded -23 > d019.only

echo "Organizaciones sin descargas aún para 2018: $(wc -l 2018.only | cut -d' ' -f1)"
echo "Organizaciones sin descargas aún para 2019: $(wc -l 2019.only | cut -d' ' -f1)"
echo "Organizaciones sin descargas aún para 2018 [directa]: $(wc -l d018.only | cut -d' ' -f1)"
echo "Organizaciones sin descargas aún para 2018 [directa]: $(wc -l d019.only | cut -d' ' -f1)"

# Unescape quotes
sed 's/^"//' 2018.only | sed 's/"$//' | sed 's/\\"/"/g' > 2018.next
sed 's/^"//' 2019.only | sed 's/"$//' | sed 's/\\"/"/g' > 2019.next
sed 's/^"//' d018.only | sed 's/"$//' | sed 's/\\"/"/g' > d018.next
sed 's/^"//' d019.only | sed 's/"$//' | sed 's/\\"/"/g' > d019.next

# Find orgs with no contracts
grep -B4 -R "No hay" 2018/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > no-obligados-2018.txt
grep -B4 -R "No hay" 2019/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > no-obligados-2019.txt
grep -B4 -R "No hay" directa/2018/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > no-obligados-d018.txt
grep -B4 -R "No hay" directa/2019/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > no-obligados-d019.txt

echo "De los logs, organizaciones sin contratos para 2018: $(wc -l no-obligados-2018.txt | cut -d' ' -f1)"
echo "De los logs, organizaciones sin contratos para 2019: $(wc -l no-obligados-2019.txt | cut -d' ' -f1)"
echo "De los logs, organizaciones sin contratos para 2018 [directa]: $(wc -l no-obligados-d018.txt | cut -d' ' -f1)"
echo "De los logs, organizaciones sin contratos para 2019 [directa]: $(wc -l no-obligados-d019.txt | cut -d' ' -f1)"

# Find orgs with no results
grep -B4 -R "Se encontraron 0 resultados en la consulta" 2018/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > 2018.noresults
grep -B4 -R "Se encontraron 0 resultados en la consulta" 2019/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > 2019.noresults
grep -B4 -R "Se encontraron 0 resultados en la consulta" directa/2018/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > d018.noresults
grep -B4 -R "Se encontraron 0 resultados en la consulta" directa/2019/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > d019.noresults

echo "De los logs, organizaciones con 0 resultados para 2018: $(wc -l 2018.noresults | cut -d' ' -f1)"
echo "De los logs, organizaciones con 0 resultados para 2019: $(wc -l 2019.noresults | cut -d' ' -f1)"
echo "De los logs, organizaciones con 0 resultados para 2018 [directa]: $(wc -l d018.noresults | cut -d' ' -f1)"
echo "De los logs, organizaciones con 0 resultados para 2019 [directa]: $(wc -l d019.noresults | cut -d' ' -f1)"

# Filter orgs with contracts
comm 2018.next no-obligados-2018.txt -23 > 2018.obliged
comm 2019.next no-obligados-2019.txt -23 > 2019.obliged
comm d018.next no-obligados-d018.txt -23 > d018.obliged
comm d019.next no-obligados-d019.txt -23 > d019.obliged

comm 2018.obliged 2018.noresults -23 > 2018.toget
comm 2019.obliged 2019.noresults -23 > 2019.toget
comm d018.obliged d018.noresults -23 > d018.toget
comm d019.obliged d019.noresults -23 > d019.toget

# Some orgs don't allow direct downloads
grep -B7 -R "Execution context was destroyed" 2018/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > 2018.email
grep -B7 -R "Execution context was destroyed" 2019/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > 2019.email
grep -B7 -R "Execution context was destroyed" directa/2018/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > d018.email
grep -B7 -R "Execution context was destroyed" directa/2019/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > d019.email

grep -B7 -R "descarga excede" 2018/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq >> 2018.email
grep -B7 -R "descarga excede" 2019/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq >> 2019.email
grep -B7 -R "descarga excede" directa/2018/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq >> d018.email
grep -B7 -R "descarga excede" directa/2019/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq >> d019.email

echo "Emails para 2018"
echo "----------------"
sort 2018.email | uniq | tee 2018.email
echo "Emails para 2019"
echo "----------------"
sort 2019.email | uniq | tee 2019.email
echo "Emails para adjudicaciones directas 2018"
echo "----------------"
sort d018.email | uniq | tee d018.email
echo "Emails para adjudicaciones directas 2019"
echo "----------------"
sort d019.email | uniq | tee d019.email

echo "De los logs, organizaciones que requieren email para 2018: $(wc -l 2018.email | cut -d' ' -f1)"
echo "De los logs, organizaciones que requieren email para 2019: $(wc -l 2019.email | cut -d' ' -f1)"
echo "De los logs, organizaciones que requieren email para 2018 [directa]: $(wc -l d018.email | cut -d' ' -f1)"
echo "De los logs, organizaciones que requieren email para 2019 [directa]: $(wc -l d019.email | cut -d' ' -f1)"

# Final filter for orgs to scrape
comm 2018.toget 2018.email -23 > 2018.pending
comm 2019.toget 2019.email -23 > 2019.pending
comm d018.toget d018.email -23 > d018.pending
comm d019.toget d019.email -23 > d019.pending

echo "Organizaciones a scrapear de nuevo para 2018: $(wc -l 2018.pending | cut -d' ' -f1)"
echo "Organizaciones a scrapear de nuevo para 2019: $(wc -l 2019.pending | cut -d' ' -f1)"
echo "Organizaciones a scrapear de nuevo para 2018 [directa]: $(wc -l d018.pending | cut -d' ' -f1)"
echo "Organizaciones a scrapear de nuevo para 2019 [directa]: $(wc -l d019.pending | cut -d' ' -f1)"

# Remove temp files (just keep the index of downloads)
rm 2018.downloaded 2018.only 2018.next 2018.noresults 2018.obliged no-obligados-2018.txt 2018.toget
rm 2019.downloaded 2019.only 2019.next 2019.noresults 2019.obliged no-obligados-2019.txt 2019.toget
rm d018.downloaded d018.only d018.next d018.noresults d018.obliged no-obligados-d018.txt d018.toget
rm d019.downloaded d019.only d019.next d019.noresults d019.obliged no-obligados-d019.txt d019.toget
