# SIPOT

Este proyecto automatiza la extracción de los documentos publicados
en la [Plataforma Nacional de Transparencia](https://consultapublicamx.inai.org.mx/vut-web/faces/view/consultaPublica.xhtml#inicio).

# Tecnología

Utiliza [puppeteer](https://pptr.dev/) para abrir una sesión de
navegador y ejecutar programáticamente una secuencia de clicks
para descargar archivos de Excel publicados bajo "Contratos de Obras,
Bienes, y Servicios" para un conjunto de organizaciones definidas en un archivo de texto.

Require uso de una terminal bash y una instalación reciente de
Node.js.

# Instalación

```
npm install
```

# Uso

El ejecutable cli.js se puede invocar con `node cli.js` o
simplemente con `./cli.js`.

Al ejecutarse mostrará logs en la pantalla y almacenará las descargas
de archivos XLS en la carpeta actual.

Los modos de _scraping_ son:

1) Una organización específica: usando --organization

```
./cli.js --organization "Secretaría de Turismo (SECTUR)"
```

2) Las organizaciones disponibles secuencia ascendente

```
./cli.js --from 40 --to 42
```

3) Las organizaciones definidas en una lista

```
./cli.js --organizationList obligados.txt
```

Los paramétros disponibles:

- organization: nombre de organización
- from: inicio de la secuencia
- to: fin de la secuencia
- organizationList: archivo de texto con las organizaciones a descargar
- development: cuando es true, se abre el navegador; de otra manera se
  hace headless
- timeout: define la paciencia del scraper en milisegundos
  (default=60000)
- type: el tipo de procedimiento; cuando se pasa el valor de 1 se
  seleccionan adjudicaciones directas.
- year: año del ejercicio a descargar (default=2019)

Uso recomendado:

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
