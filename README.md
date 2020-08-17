# SIPOT

Este proyecto automatiza la extracción de los documentos publicados
en la [Plataforma Nacional de Transparencia](https://consultapublicamx.inai.org.mx/vut-web/faces/view/consultaPublica.xhtml#inicio).

![screenshot](https://github.com/imco/sipot/blob/master/screenshot.jpg)

# Tecnología

Utiliza [puppeteer](https://pptr.dev/) para abrir una sesión de
navegador y ejecutar programáticamente una secuencia de clicks
para descargar archivos de Excel publicados bajo "Contratos de Obras,
Bienes, y Servicios" para un conjunto de organizaciones definidas en un archivo de texto.

# Instalación

```
npm install
```

El `npm` script instalará los siguientes paquetes para tu instalación de node (ver package.json):
- minimist
- puppeteer
- xlsx

## Requerimientos

Para el scraper
- Instalación de Node.js en versión mínima 10
- Chrome

Para etl.js
- Terminal tipo bash
- Instalado python y csvkit

# Uso

El ejecutable cli.js se puede invocar con `node cli.js` o
simplemente con `./cli.js`.

Al ejecutarse mostrará logs en la pantalla y almacenará las descargas
de archivos XLS en la carpeta actual.

Para iniciar una sesión de _scraping_ es necesario pasar una lista de organizaciones en un archivo de texto:

```
./cli.js --organizationList obligados.txt
```

Los paramétros disponibles a configurar son:

- organizationList: archivo de texto con las organizaciones a descargar
- development: cuando es true, se abre el navegador; de otra manera se
  hace headless
- timeout: define la paciencia del scraper en milisegundos
  (default=60000)
- type: el tipo de procedimiento; cuando se pasa el valor de 1 se
  seleccionan adjudicaciones directas.
- year: año del ejercicio a descargar (default=2019)

**Uso recomendado:**

Se recomienda trabajar con una lista de organizaciones, guardar
las descargas por año y tipo de procedimiento, así como almacenar
los logs, ya que este
proyecto contiene herramientas para analizarlos y determinar
las organizaciones que quedan pendientes para descargar.

```
./cli.js --organizacionList obligados.txt
--development true --timeout 90000 --type 1 --year 2018 | tee
data/adjudicaciones/2018/$(date +"%Y%m%d_%T").log
```

En ocasiones el _scraper_ se rompe por algun malfuncionamiento del
sitio, en este caso es recomendable ejecutar el script `next.sh` para
evaluar los logs del scraper, analizar la lista de descargas, y con esto determinar y generar una nueva lista de organizaciones pendientes a descargar en la siguiente sesión.

```
sh next.sh data/adjudicaciones/2018/
Analizando adjudicaciones/2018/
Organizaciones con archivos: 301
Organizaciones sin descargas aún para: 41
De los logs, organizaciones sin contratos: 11
De los logs, organizaciones con 0 resultados: 31
De los logs, organizaciones que requieren email: 5
----------------
Comisión Federal de Electricidad (CFE)
Hospital General de México "Dr. Eduardo Liceaga" (HGM)
Instituto de Seguridad y Servicios Sociales de los Trabajadores del Estado (ISSSTE)
Instituto Nacional de Ciencias Médicas y Nutrición Salvador Zubirán (INNSZ)
Secretaría de Comunicaciones y Transportes (SCT)
Organizaciones a scrapear de nuevo: 2


./cli.js --organizacionList pendientes.txt
--development true --timeout 90000 --type 1 --year 2018 | tee
data/adjudicaciones/2018/$(date +"%Y%m%d_%T").log
```

# Notas

Varias limitaciones y defectos del sitio complican la operación eficiente del _scraper_. El hecho de que el SIPOT descargue varias MBs en cada intervención en el sitio, hacen que la navegación sea lenta, y en ocasiones la sesión se reinicie. Esto inevitablemente romperá el proceso de puppeteer.

También existen dependencias en las que dado el tamaño de los archivos,
el sitio sugiere pedirlas por correo. Estas organizaciones se tienen que
descargar manualmente.

# ETL

La utilería etl.js contiene varias herramientas para procesar los
archivos descargados.

- index: genera un índice de dependencias y la ubicación de sus archivos
  en el directorio. Útil para evaluar cuáles se han descargado hasta el
momento.
- merge: mezcla todos los XLS o XLSX (los recibidos por email) de un directorio en un CSV.

Ejemplo de uso:
```sh
time ./etl.js --op merge --directory data/adjudicaciones/2018 --format xlsx --cores 12
Ejecutando ls -1 data/adjudicaciones/2018/*.xlsx | parallel -k -j 12 --eta "./to-csv.sh {} '2,3,4,7,10,49' >> ./1588906501453.csv.{%}-{#}"; cat ./1588906501453.csv.* > ./1588906501453.csv; rm ./1588906501453.csv.*
Parseando archivos xlsx para adjudicaciones
Columnas removidas: [ 2, 3, 4, 7, 10, 49 ]
Escribiendo a ./1588906501453.csv

Computers / CPU cores / Max jobs to run
1:local / 12 / 12

Computer:jobs running/jobs completed/%of started jobs/Average seconds to complete
ETA: 0s Left: 0 AVG: 0.88s  local:0/16/100%/1.1s
./etl.js --op merge --directory data/adjudicaciones/2018 --format xlsx --core  161.57s user 6.82s system 911% cpu 18.469 total
```

Dependencias:
- [csvkit](https://csvkit.readthedocs.io/en/latest/)
- [parallel](https://www.gnu.org/software/parallel/)
