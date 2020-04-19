# Build index of downloads
./etl.js --directory 2018/ > 2018.csv
./etl.js --directory 2019/ > 2019.csv

# Get list of downloaded organizations
cut -d ';' -f1 2018.csv | tail -n +2 | sort > 2018.downloaded
cut -d ';' -f1 2019.csv | tail -n +2 | sort > 2019.downloaded

# Find organizations with no downloads
comm obligados.txt 2018.downloaded -23 > 2018.only
comm obligados.txt 2019.downloaded -23 > 2019.only

# Unescape quotes
sed 's/^"//' 2018.only | sed 's/"$//' | sed 's/\\"/"/g' > 2018.next
sed 's/^"//' 2019.only | sed 's/"$//' | sed 's/\\"/"/g' > 2019.next

# Find orgs with no contracts
grep -B4 -R "No hay" 2018/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > no-obligados-2018.txt
grep -B4 -R "No hay" 2019/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > no-obligados-2019.txt

# Filter orgs with contracts
comm 2018.next no-obligados-2018.txt -23 > 2018.obliged
comm 2019.next no-obligados-2019.txt -23 > 2019.obliged

# Some orgs don't allow direct downloads
grep -B7 -R "Execution context was destroyed" 2018/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > 2018.email
grep -B7 -R "Execution context was destroyed" 2019/ | grep Objetivo | cut -d ' ' -f 2- | sort | uniq > 2019.email

# Final filter for orgs to scrape
comm 2018.obliged 2018.email -23 > 2018.pending
comm 2019.obliged 2019.email -23 > 2019.pending

# Remove temp files (just keep the index of downloads)
rm 2018.downloaded 2018.only 2018.next 2018.obliged no-obligados-2018.txt
rm 2019.downloaded 2019.only 2019.next 2019.obliged no-obligados-2019.txt
