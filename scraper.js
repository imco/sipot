const puppeteer = require('puppeteer')
const fs = require('fs')
const { promisify } = require('util')
const exists = promisify(fs.stat)
const path = require('path')

function toDownload (filename, timeoutSeconds = 60, intervalSeconds = 1) {
  return new Promise((resolve, reject) => {
    let interval
    let timeout
    const filepath = path.join(process.cwd(), filename)

    timeout = setTimeout(() => {
      clearInterval(interval)
      const error = `No hemos podido descargar ${filename} en menos de 60s`
      console.log(error)
      return reject(error)
    }, timeoutSeconds * 1000)

    interval = setInterval(async () => {
      try {
        await exists(filepath)
        clearTimeout(timeout)
        clearInterval(interval)

        const success = `Se ha descargado ${filename}`
        console.log(success)
        return resolve(success)
      } catch (e) {
        console.log(filepath, 'aun no existe')
      }
    }, intervalSeconds * 1000)
  })
}

async function startBrowser (params) {
  let options = params || {}
  if (options.development) {
    options = {
      headless: false,
      slowMo: 50
    }
  }

  const browser = await puppeteer.launch(options)
  return browser
}

/**
 * Prepara la configuración común de la página a escrapear
 * @param {Object} puppeeter.Browser
 * @returns {Object} puppeeter.Page
 */
async function getPage (browser) {
  const page = await browser.newPage()

  // Descarga archivos en la carpeta local
  await page._client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: process.cwd()
  })

  await page.setRequestInterception(true)
  page.on('request', interceptedRequest => {
    // No tiene caso desperdiciar ancho de banda en imágenes
    if (['.jpg', '.png', '.svg'].some(ext => interceptedRequest.url().endsWith(ext))) {
      interceptedRequest.abort()
    } else {
      interceptedRequest.continue()
    }
  })

  await page.setViewport({ width: 1280, height: 800 })

  return page
}

/**
 * Consigue el archivo Excel de contratos para una organization
 * @param {Object} page de Puppeteer.Page
 * @param {String} organizationName se puede usar nombre ('Secretaría de Educación Pública (SEP)')
 * @param {Number} organizationIndex o se puede usar índice (42)
 */
async function getContract (page, organizationName = null, organizationIndex = 0) {
  const startUrl = 'https://consultapublicamx.inai.org.mx/vut-web/faces/view/consultaPublica.xhtml#inicio'
  const year = 2018

  const downloadsInProgress = []

  // Inspecciona respuestas para buscar el nombre del archivo a descargar
  page.on('response', async res => {
    if (res.url().endsWith('consultaPublica.xhtml')) {
      const headers = res.headers()
      if (headers['content-type'] === 'application/vnd.ms-excel') {
        // Si pedimos un excel, checar el nombre
        const match = headers['content-disposition'].match(/filename\="(.*)"/) || []
        const filename = match[1]
        console.log('Descargando', filename)

        // Marcamos la descarga como pendiente
        downloadsInProgress.push(toDownload(filename))
      }
    }
  })

  await page.goto(startUrl)

  // Click en el filtro "Estado o Federación"
  const filter = await page.waitForSelector('#filaSelectEF > .col-md-4 > .btn-group > .btn > .filter-option')
  await filter.click()

  // Selecciona el segundo elemento del dropdown: "Federación"
  const fed = await page.waitForSelector('.btn-group > .dropdown-menu > .dropdown-menu > li:nth-child(2) > a')
  await fed.click()

  // La página se divide en menús [.botonActiva] colapsables por letra del abecedario
  await page.waitForSelector('.botonActiva')

  if (!organizationName) {
    // Buscamos la organización que le corresponde tal índice
    const orgElements = await page.$x('//input[starts-with(@id, "formListaSujetosAZ")]')
    const targetOrganization = orgElements[organizationIndex]
    organizationName = await targetOrganization.evaluate(node => node.value)
  }

  console.log('Objetivo:', organizationName)
  // Filtramos la lista para que aparezca nuestra opción
  const orgFilter = await page.waitForSelector('input.form-control.intitucionResp')
  await orgFilter.type(organizationName)

  // Hacemos click en la organización de interés
  const orgInput = await page.waitForXPath(`//input[@value="${organizationName}"]`)
  orgInput.click()

  await page.waitForXPath('//form[@id="formListaObligaciones"]')

  // Selecciona el año del dropdown
  const period = await page.waitForXPath('//select[@id="formEntidadFederativa:cboEjercicio"]')
  await period.select(String(year))

  console.log('Seleccionamos el año', year)

  // Espera a que el bloqueo de pantalla de la consulta se quite
  await page.waitForSelector('div.capaBloqueaPantalla', { hidden: true })

  // Ahora queremos cargar la sección de "CONTRATOS DE OBRAS, BIENES, Y SERVICIOS".
  // El elemento a clickear tiene un id con una terminación numérica que
  // no se repite entre renders.
  // Es por esto que vamos a buscar el label con la etiqueta CONTRATOS DE OBRAS...
  // y luego obtener una referencia al ancestro que sí es clickeable.
  await page.waitForXPath('//div[@class="tituloObligacion"]')
  const contractsLabel = await page.waitForXPath('//label[contains(text(), "CONTRATOS DE OBRAS, BIENES Y SERVICIOS")]')
  await contractsLabel.click()

  // Espera a que carge la página de documentos
  await page.waitForXPath('//div[@id="formListaFormatos:listaSelectorFormatos"]')

  // Selecciona todos en Periodo de actualización
  const checkboxPath = '//input[@id="formInformacionNormativa:checkPeriodos:4"]'
  const checkbox = await page.$x(checkboxPath)
  await checkbox[0].click()
  console.log('Seleccionamos todos los periodos de actualización')

  // Consultar
  const queryButton = await page.$x('//a[contains(text(), "CONSULTAR")]')
  await queryButton[0].click()

  // Scroll up
  await page.evaluate(_ => {
    window.scrollTo(0, 400)
  })

  // Espera a que el bloqueo de pantalla de la consulta se quite
  await page.waitForSelector('div.capaBloqueaPantalla', { hidden: true })
  await page.waitFor(1000)

  // Seleccionar opción de descargar
  const downloadButton = await page.waitForXPath('//a[contains(text(), "DESCARGAR")]')
  await downloadButton.click()

  await page.waitFor(1000)

  // Seleccionar opción de descargar en la modal
  try {
    const downloadLabel = await page.$x('//label[contains(text(), "Descargar")]')
    await downloadLabel[0].click()
  } catch (e) {
    console.log('No se encontro el boton de descarga - active manualmente')
    await page.waitFor(10000)
  }

  // Hacer click en el dropdown menu
  const dropdown = await page.waitForXPath('//button[@data-id="formModalRangos:rangoExcel"]')
  await dropdown.click()

  // Espera a que cargue el rango de formatos
  await page.waitForXPath('//select[@id="formModalRangos:rangoExcel"]')

  // Obtener las opciones
  const options = await page.$x('//select[@id="formModalRangos:rangoExcel"]/option')

  // Descargar cada opcion disponible
  for (let i in options) {
    const [text, value] = await options[i].evaluate(node => [node.text, node.value])
    console.log('Opción encontrada:', text, value)

    // Excepto el primer elemento que dice "Seleccionar" cuyo valor es -1
    if (value === '-1') continue

    // Selecciona esta opción del rango
    (await page.$x(`//a/span[contains(text(), "${text}")]`))[0].click()

    // Descarga archivo Excel
    const downloadExcel = await page.waitForXPath('//input[@id="formModalRangos:btnDescargaExcel"]')
    await downloadExcel.click()

    console.log('Rango seleccionado')

    // Esperamos a que los clicks surtan efecto
    await page.waitFor(5000)
  }

  // Esperamos un poco a que el servidor responda
  await page.waitFor(5000)

  // El método toDownload hace que esperemos a que la descarga termine
  await Promise.all(downloadsInProgress)
}

module.exports = {
  getContract,
  getPage,
  startBrowser
}
