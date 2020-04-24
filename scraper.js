const puppeteer = require('puppeteer')
const fs = require('fs')
const { promisify } = require('util')
const exists = promisify(fs.stat)
const path = require('path')

let didRedirect = false
const downloadsInProgress = []
const fromTargetUrl = res => res.url().endsWith('consultaPublica.xhtml')
const hasDisplay = 'contains(@style, "display: block")'
const sequence = [
  'inicio',
  'sujetosObligados',
  'obligaciones',
  'tarjetaInformativa'
]

/**
 * Navega en reversa el sitio.
 * Por ejemplo si queremos regresar de las descargas de una org
 * al listado de organizaciones.
 * @param {Page} page
 * @param {string} nextLocation
 */
async function backTo (page, nextLocation) {
  const url = page.url()
  console.log('Actualmente estoy en', url.split('/').slice(-1)[0])
  const [base, target] = url.split('#')

  // Nota: target es el # actual
  const nextLocationIndex = sequence.indexOf(nextLocation)
  const targetIndex = sequence.indexOf(target)

  // Si la ubicación deseada (nextLocation) es la misma o enfrente
  // salimos del método
  if (nextLocationIndex - targetIndex >= 0) {
    console.log('Ya estamos en la ubicación deseada')
    return true
  }

  const navigationSteps = sequence
    .slice(nextLocationIndex, targetIndex)
    .reverse()

  console.log('Navegando', navigationSteps.join('->'))
  for (let i in navigationSteps) {
    await page.goto(`${base}#${navigationSteps[i]}`)
  }
}

async function takeTo (page, nextLocation, params) {
  const { organizationName, organizationIndex, year } = params

  const url = page.url()
  console.log('Actualmente estoy en', url.split('/').slice(-1)[0])
  const [base, target] = url.split('#')

  // Nota: target es el # actual
  const nextLocationIndex = sequence.indexOf(nextLocation)
  const targetIndex = sequence.indexOf(target)

  if (nextLocationIndex - targetIndex <= 0) {
    return await backTo(page, nextLocation)
  }

  // Pa' delante (sin contar el inicio)
  const steps = sequence.slice(targetIndex + 1, nextLocationIndex + 1)

  for (let i in steps) {
    const step = steps[i]
    console.log(`navegando a #${step}`)
    switch (step) {
      case 'sujetosObligados':
        await navigateToOrganizations(page)
        break
      case 'obligaciones':
        await navigateToObligations(page, organizationName, organizationIndex)
        break
      case 'tarjetaInformativa':
        await navigateToInformationCard(page, year)
        break
    }
  }
}

/**
 * Consigue el archivo Excel de contratos para una organization
 * @param {Object} page de Puppeteer.Page
 * @param {String} organizationName se puede usar nombre ('Secretaría de Educación Pública (SEP)')
 * @param {Number} organizationIndex o se puede usar índice (42)
 * @param {Number} year
 */
async function getContract (page, organizationName = null, organizationIndex = 0, year = 2018, type) {
  // Espera a que carge la página de documentos
  await page.waitForXPath('//div[@id="formListaFormatos:listaSelectorFormatos"]')

  if (type === 1) {
    const typeCheckbox = await page.$x('//label[contains(@class, "containerCheck")]')
    await typeCheckbox[1].click()
    await page.waitForSelector('div.capaBloqueaPantalla', { hidden: true })
  }

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

  // Si no hay resultados nos brincamos la organización
  const downloadCounter = await page.$x('//span[contains(text(), "Se encontraron")]/..')
  const counterText = await downloadCounter[0].evaluate(node => node.innerText)
  const match = counterText.match(/Se encontraron (\d+) resultados/) || []
  const count = Number(match[1])
  console.log(`Se encontraron ${count} resultados en la consulta`)
  if (count === 0) return false

  // Seleccionar opción de descargar
  const downloadButton = await page.waitForXPath('//a[contains(text(), "DESCARGAR")]')
  await downloadButton.click()

  // Seleccionar opción de descargar en la modal
  const downloadLabel = await page.waitForXPath('//label[contains(text(), "Descargar")]')

  try {
    await downloadLabel.click()
  } catch (e) {
    throw new Error('No se encontro el boton de descarga en el modal')
  }

  // Para hacer click en el dropdown menu en cada iteración
  const dropdown = await page.waitForXPath('//button[@data-id="formModalRangos:rangoExcel"]')

  // Espera a que cargue el rango de formatos
  // y obtiene las opciones
  await page.waitForXPath('//select[@id="formModalRangos:rangoExcel"]')
  const options = await page.$x('//select[@id="formModalRangos:rangoExcel"]/option')

  // Descargar cada opcion disponible
  for (let i in options) {
    const [text, value] = await options[i].evaluate(node => [node.text, node.value])
    console.log('Opción encontrada:', text, value)

    // Excepto el primer elemento que dice "Seleccionar" cuyo valor es -1
    if (value === '-1') continue

    // Selecciona esta opción del rango
    await dropdown.click()

    const optionSpan = await page.$x(`//a/span[contains(text(), "${text}")]`)
    await optionSpan[0].click()

    // Descarga archivo Excel
    const downloadExcel = await page.waitForXPath('//input[@id="formModalRangos:btnDescargaExcel"]')
    await downloadExcel.click()

    console.log('Rango seleccionado')

    // Esperamos 90s a que el servidor responda a nuestra petición de descarga
    // El listener <responseHandler> agregará el archivo a la lista
    // de descargas pendientes, y esperaremos a que terminen antes de continuar.
    const downloadRequest = await page.waitForResponse(async r => {
      return fromTargetUrl(r) && r.status() === 200
    }, { timeout: 90000 })

    if (!downloadRequest.ok()) {
      console.log('No contesto el servidor con éxito')
      return false
    }

    if (didRedirect) {
      // Algunas organizaciones no se pueden descargar, más que por email
      // entonces el sistema redirige al inicio y muestra un modal
      const sizePopup = await page.waitForXPath(`//div[@id="modalAvisoError" and ${hasDisplay}]`)
      if (sizePopup) {
        const errorDiv = await page.$x(`//div[@id="modalAvisoError"]`)
        const errorMsg = await errorDiv[0].evaluate(node => node.innerText)
        console.log(errorMsg.trim().split('.')[0])
      }

      console.log('Sitio redirige al inicio')
      return false
    }

    await page.waitFor(1000)
    await Promise.all(downloadsInProgress)
  }

  // Wait again for any remaining download to get to the queue (esp. the last one)
  await page.waitFor(1000)
  await Promise.all(downloadsInProgress)

  // Quita la ventana modal
  const modal = await page.waitForSelector('#modalRangos')
  await modal.click()
  await page.waitForSelector('div.capaBloqueaPantalla', { hidden: true })

  return true
}

/**
 * Inspecciona respuestas para buscar el nombre del archivo a descargar
 * Agrega también una {Promise} de descarga (ver toDownload) a la
 * lista global de descargas pendientes.
 * @params {Response) res
 * @return {string|null} filename
 */
function responseHandler (res) {
  if (fromTargetUrl(res)) {
    const headers = res.headers()
    // Si es un excel, registramos el nombre y monitoreamos la descarga
    if (headers['content-type'] === 'application/vnd.ms-excel') {
      // Si pedimos un excel, checar el nombre
      const match = headers['content-disposition'].match(/filename\="(.*)"/) || []
      const filename = match[1]
      console.log('Descargando', filename)

      // Marcamos la descarga como pendiente
      downloadsInProgress.push(toDownload(filename))

      return filename
    } else if ((headers['set-cookie'] || '').endsWith('path=/')) {
      didRedirect = true
    }
  }

  return null
}

/**
 * Prepara la configuración común de la página a escrapear
 * @param {Object} puppeeter.Browser
 * @param {Object} opts
 * @returns {Object} puppeeter.Page
 */
async function getPage (browser, opts) {
  const page = await browser.newPage()
  const timeout = opts.timeout || 60000

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
  page.setDefaultTimeout(timeout)

  page.on('response', responseHandler)

  return page
}

/**
 * Getting from #inicio to #sujetosObligados
 */
async function navigateToOrganizations (page) {
  // Click en el filtro "Estado o Federación"
  const filter = await page.waitForSelector('#filaSelectEF > .col-md-4 > .btn-group > .btn > .filter-option')
  await filter.click()

  // Selecciona el segundo elemento del dropdown: "Federación"
  const fed = await page.waitForSelector('.btn-group > .dropdown-menu > .dropdown-menu > li:nth-child(2) > a')
  await fed.click()
}

/**
 * Selecciona del dropdown la organización
 * @param {Page} page
 * @param {string} orgId
 */
async function selectNextOrganization (page, orgId) {
  const dropdownButton = await page.$x('//button[@data-id="formEntidadFederativa:cboSujetoObligado"]')
  if (dropdownButton.length) {
    await dropdownButton[0].click()
    const dropdownOrg = await page.waitForXPath(`//a/span[contains(text(), '${orgId}')]`)
    if (!dropdownOrg) {
      console.log('Organización no encontrada en dropdown', orgId)
    } else {
      console.log('Seleccionando del dropdown a', orgId)
      await dropdownOrg.click()
      await page.waitForSelector('div.capaBloqueaPantalla', { hidden: true })
    }
  } else {
    console.log('No encontramos el dropdown de organizaciones')
  }
}

/**
 * Getting from #sujetosObligados to #obligaciones
 */
async function navigateToObligations (page, organizationName = null, organizationIndex = 0) {
  // La página se divide en menús [.botonActiva] colapsables por letra del abecedario
  await page.waitForSelector('.botonActiva')

  if (!organizationName) {
    // Buscamos la organización que le corresponde tal índice
    const orgElements = await page.$x('//input[starts-with(@id, "formListaSujetosAZ")]')
    const targetOrganization = orgElements[organizationIndex]
    organizationName = await targetOrganization.evaluate(node => node.value)
  }

  console.log('Objetivo:', organizationName)

  // Filtramos la lista para que aparezca nuestra opción,
  // pero primero limpiamos el campo
  const orgFilter = await page.waitForSelector('input.form-control.intitucionResp')
  await page.evaluate(() => {
    $('input.form-control.intitucionResp')[0].value = ''
  })
  await orgFilter.type(organizationName)

  // Hacemos click en la organización de interés
  const orgInput = await page.waitForXPath(`//input[@value='${organizationName}']`)
  orgInput.click()
}

/**
 * Getting from #obligaciones to #tarjetaInformativa
 */
async function navigateToInformationCard (page, year = 2018) {
  await page.waitForXPath('//form[@id="formListaObligaciones"]')

  // Selecciona el año del dropdown
  const period = await page.waitForXPath('//select[@id="formEntidadFederativa:cboEjercicio"]')
  await period.select(String(year))

  console.log('Seleccionamos el año', year)

  // Espera a que el bloqueo de pantalla de la consulta se quite
  await page.waitForSelector('div.capaBloqueaPantalla', { hidden: true })

  // Algunas organizaciones no tendrán sección de contratos
  let contractsLabel = []

  // Otras muestran un popup, así que hay que asegurarnos de cerrarlo
  const noContractsPopup = await page.$x(`//div[@id="modalSinObligaciones" and ${hasDisplay}]`)

  if (noContractsPopup.length) {
    await noContractsPopup[0].click()
  } else {
    // Ahora queremos cargar la sección de "CONTRATOS DE OBRAS, BIENES, Y SERVICIOS".
    // El elemento a clickear tiene un id con una terminación numérica que
    // no se repite entre renders.
    // Es por esto que vamos a buscar el label con la etiqueta CONTRATOS DE OBRAS...
    // y luego obtener una referencia al ancestro que sí es clickeable.
    await page.waitForXPath('//div[@class="tituloObligacion"]')
    contractsLabel = await page.$x('//label[contains(text(), "CONTRATOS DE OBRAS, BIENES Y SERVICIOS")]')
  }

  if (!contractsLabel.length) {
    const msg = 'No hay contratos para esta organización'
    console.log(msg)
    throw new Error(msg)
  } else {
    await contractsLabel[0].click()
  }
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

module.exports = {
  backTo,
  downloadsInProgress,
  getContract,
  getPage,
  navigateToOrganizations,
  selectNextOrganization,
  startBrowser,
  takeTo,
  toDownload
}
